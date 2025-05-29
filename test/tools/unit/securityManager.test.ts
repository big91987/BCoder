/**
 * 安全管理器单元测试
 */

import * as path from 'path';
import { setupMockEnvironment, teardownMockEnvironment, mockLogger } from '../../setup/mockVSCode';
import { createTempTestDir, cleanupTempDir, createTestFile, TestAssert, TestRunner } from '../../setup/testUtils';

// 设置模拟环境
setupMockEnvironment();

// 导入要测试的模块
import { SecurityManager } from '../../../src/security/securityManager';

// 模拟 logger
(global as any).logger = mockLogger;

async function runSecurityManagerTests() {
    const runner = new TestRunner();
    let tempDir: string;
    let securityManager: SecurityManager;

    // 设置测试环境
    runner.beforeEach(() => {
        tempDir = createTempTestDir('security-test');
        securityManager = new SecurityManager(tempDir);
    });

    // 清理测试环境
    runner.afterEach(() => {
        if (tempDir) {
            cleanupTempDir(tempDir);
        }
    });

    // 测试路径验证
    runner.test('validatePath - 工作区内路径应该通过', () => {
        const validPath = path.join(tempDir, 'test.txt');
        const result = securityManager.validatePath(validPath);

        TestAssert.isTrue(result.granted, 'Should grant access to workspace path');
        TestAssert.isTrue(result.autoApproved || false, 'Should auto-approve workspace path');
    });

    runner.test('validatePath - 工作区外路径应该被拒绝', () => {
        const invalidPath = '/etc/passwd';
        const result = securityManager.validatePath(invalidPath);

        TestAssert.isFalse(result.granted, 'Should deny access to outside path');
        TestAssert.contains(result.reason!, 'outside workspace', 'Should indicate outside workspace');
    });

    runner.test('validatePath - 路径遍历攻击应该被阻止', () => {
        const maliciousPath = path.join(tempDir, '../../../etc/passwd');
        const result = securityManager.validatePath(maliciousPath);

        TestAssert.isFalse(result.granted, 'Should deny path traversal');
        TestAssert.contains(result.reason!, 'traversal', 'Should indicate path traversal');
    });

    runner.test('validatePath - 敏感目录应该被拒绝', () => {
        const nodeModulesPath = path.join(tempDir, 'node_modules', 'package', 'file.js');
        const result = securityManager.validatePath(nodeModulesPath);

        TestAssert.isFalse(result.granted, 'Should deny access to node_modules');
        TestAssert.contains(result.reason!, 'denied list', 'Should indicate denied path');
    });

    // 测试文件读取权限
    runner.test('validateFileRead - 存在的文件应该通过', async () => {
        const testFile = createTestFile(tempDir, 'readable.txt', 'test content');
        const result = await securityManager.validateFileRead(testFile);

        TestAssert.isTrue(result.granted, 'Should grant read access to existing file');
    });

    runner.test('validateFileRead - 不存在的文件应该被拒绝', async () => {
        const nonExistentFile = path.join(tempDir, 'nonexistent.txt');
        const result = await securityManager.validateFileRead(nonExistentFile);

        TestAssert.isFalse(result.granted, 'Should deny read access to non-existent file');
        TestAssert.contains(result.reason!, 'does not exist', 'Should indicate file not found');
    });

    runner.test('validateFileRead - 目录应该被拒绝', async () => {
        const result = await securityManager.validateFileRead(tempDir);

        TestAssert.isFalse(result.granted, 'Should deny read access to directory');
        TestAssert.contains(result.reason!, 'not a file', 'Should indicate not a file');
    });

    // 测试文件写入权限
    runner.test('validateFileWrite - 有效路径应该通过', async () => {
        const newFile = path.join(tempDir, 'writable.txt');
        const result = await securityManager.validateFileWrite(newFile);

        TestAssert.isTrue(result.granted, 'Should grant write access to valid path');
    });

    runner.test('validateFileWrite - 不存在的父目录应该被拒绝', async () => {
        const invalidFile = path.join(tempDir, 'nonexistent-dir', 'file.txt');
        const result = await securityManager.validateFileWrite(invalidFile);

        TestAssert.isFalse(result.granted, 'Should deny write to non-existent directory');
        TestAssert.contains(result.reason!, 'does not exist', 'Should indicate directory not found');
    });

    // 测试目录访问权限
    runner.test('validateDirectoryAccess - 存在的目录应该通过', async () => {
        const result = await securityManager.validateDirectoryAccess(tempDir);

        TestAssert.isTrue(result.granted, 'Should grant access to existing directory');
    });

    runner.test('validateDirectoryAccess - 不存在的目录应该被拒绝', async () => {
        const nonExistentDir = path.join(tempDir, 'nonexistent');
        const result = await securityManager.validateDirectoryAccess(nonExistentDir);

        TestAssert.isFalse(result.granted, 'Should deny access to non-existent directory');
        TestAssert.contains(result.reason!, 'does not exist', 'Should indicate directory not found');
    });

    runner.test('validateDirectoryAccess - 文件应该被拒绝', async () => {
        const testFile = createTestFile(tempDir, 'not-a-dir.txt', 'content');
        const result = await securityManager.validateDirectoryAccess(testFile);

        TestAssert.isFalse(result.granted, 'Should deny directory access to file');
        TestAssert.contains(result.reason!, 'not a directory', 'Should indicate not a directory');
    });

    // 测试安全上下文
    runner.test('getSecurityContext - 应该返回正确的上下文', () => {
        const context = securityManager.getSecurityContext();

        TestAssert.equals(context.workspaceRoot, tempDir, 'Workspace root should match');
        TestAssert.isArray(context.allowedPaths, 'Allowed paths should be array');
        TestAssert.isArray(context.deniedPaths, 'Denied paths should be array');
        TestAssert.isTrue(context.maxFileSize > 0, 'Max file size should be positive');
    });

    // 测试配置更新
    runner.test('updateSecurityContext - 应该更新配置', () => {
        const newMaxSize = 5 * 1024 * 1024; // 5MB
        securityManager.updateSecurityContext({ maxFileSize: newMaxSize });

        const context = securityManager.getSecurityContext();
        TestAssert.equals(context.maxFileSize, newMaxSize, 'Max file size should be updated');
    });

    // 运行所有测试
    const results = await runner.run();
    return results;
}

// 导出测试函数
export { runSecurityManagerTests };

// 如果直接运行此文件
if (require.main === module) {
    runSecurityManagerTests()
        .then(results => {
            console.log(`\n🔒 Security Manager Tests Complete: ${results.passed} passed, ${results.failed} failed`);
            process.exit(results.failed > 0 ? 1 : 0);
        })
        .catch(error => {
            console.error('Test execution failed:', error);
            process.exit(1);
        })
        .finally(() => {
            teardownMockEnvironment();
        });
}
