"use strict";
/**
 * 安全管理器单元测试
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSecurityManagerTests = void 0;
const path = __importStar(require("path"));
const mockVSCode_1 = require("../../setup/mockVSCode");
const testUtils_1 = require("../../setup/testUtils");
// 设置模拟环境
(0, mockVSCode_1.setupMockEnvironment)();
// 导入要测试的模块
const securityManager_1 = require("../../../src/security/securityManager");
// 模拟 logger
global.logger = mockVSCode_1.mockLogger;
async function runSecurityManagerTests() {
    const runner = new testUtils_1.TestRunner();
    let tempDir;
    let securityManager;
    // 设置测试环境
    runner.beforeEach(() => {
        tempDir = (0, testUtils_1.createTempTestDir)('security-test');
        securityManager = new securityManager_1.SecurityManager(tempDir);
    });
    // 清理测试环境
    runner.afterEach(() => {
        if (tempDir) {
            (0, testUtils_1.cleanupTempDir)(tempDir);
        }
    });
    // 测试路径验证
    runner.test('validatePath - 工作区内路径应该通过', () => {
        const validPath = path.join(tempDir, 'test.txt');
        const result = securityManager.validatePath(validPath);
        testUtils_1.TestAssert.isTrue(result.granted, 'Should grant access to workspace path');
        testUtils_1.TestAssert.isTrue(result.autoApproved, 'Should auto-approve workspace path');
    });
    runner.test('validatePath - 工作区外路径应该被拒绝', () => {
        const invalidPath = '/etc/passwd';
        const result = securityManager.validatePath(invalidPath);
        testUtils_1.TestAssert.isFalse(result.granted, 'Should deny access to outside path');
        testUtils_1.TestAssert.contains(result.reason, 'outside workspace', 'Should indicate outside workspace');
    });
    runner.test('validatePath - 路径遍历攻击应该被阻止', () => {
        const maliciousPath = path.join(tempDir, '../../../etc/passwd');
        const result = securityManager.validatePath(maliciousPath);
        testUtils_1.TestAssert.isFalse(result.granted, 'Should deny path traversal');
        testUtils_1.TestAssert.contains(result.reason, 'traversal', 'Should indicate path traversal');
    });
    runner.test('validatePath - 敏感目录应该被拒绝', () => {
        const nodeModulesPath = path.join(tempDir, 'node_modules', 'package', 'file.js');
        const result = securityManager.validatePath(nodeModulesPath);
        testUtils_1.TestAssert.isFalse(result.granted, 'Should deny access to node_modules');
        testUtils_1.TestAssert.contains(result.reason, 'denied list', 'Should indicate denied path');
    });
    // 测试文件读取权限
    runner.test('validateFileRead - 存在的文件应该通过', async () => {
        const testFile = (0, testUtils_1.createTestFile)(tempDir, 'readable.txt', 'test content');
        const result = await securityManager.validateFileRead(testFile);
        testUtils_1.TestAssert.isTrue(result.granted, 'Should grant read access to existing file');
    });
    runner.test('validateFileRead - 不存在的文件应该被拒绝', async () => {
        const nonExistentFile = path.join(tempDir, 'nonexistent.txt');
        const result = await securityManager.validateFileRead(nonExistentFile);
        testUtils_1.TestAssert.isFalse(result.granted, 'Should deny read access to non-existent file');
        testUtils_1.TestAssert.contains(result.reason, 'does not exist', 'Should indicate file not found');
    });
    runner.test('validateFileRead - 目录应该被拒绝', async () => {
        const result = await securityManager.validateFileRead(tempDir);
        testUtils_1.TestAssert.isFalse(result.granted, 'Should deny read access to directory');
        testUtils_1.TestAssert.contains(result.reason, 'not a file', 'Should indicate not a file');
    });
    // 测试文件写入权限
    runner.test('validateFileWrite - 有效路径应该通过', async () => {
        const newFile = path.join(tempDir, 'writable.txt');
        const result = await securityManager.validateFileWrite(newFile);
        testUtils_1.TestAssert.isTrue(result.granted, 'Should grant write access to valid path');
    });
    runner.test('validateFileWrite - 不存在的父目录应该被拒绝', async () => {
        const invalidFile = path.join(tempDir, 'nonexistent-dir', 'file.txt');
        const result = await securityManager.validateFileWrite(invalidFile);
        testUtils_1.TestAssert.isFalse(result.granted, 'Should deny write to non-existent directory');
        testUtils_1.TestAssert.contains(result.reason, 'does not exist', 'Should indicate directory not found');
    });
    // 测试目录访问权限
    runner.test('validateDirectoryAccess - 存在的目录应该通过', async () => {
        const result = await securityManager.validateDirectoryAccess(tempDir);
        testUtils_1.TestAssert.isTrue(result.granted, 'Should grant access to existing directory');
    });
    runner.test('validateDirectoryAccess - 不存在的目录应该被拒绝', async () => {
        const nonExistentDir = path.join(tempDir, 'nonexistent');
        const result = await securityManager.validateDirectoryAccess(nonExistentDir);
        testUtils_1.TestAssert.isFalse(result.granted, 'Should deny access to non-existent directory');
        testUtils_1.TestAssert.contains(result.reason, 'does not exist', 'Should indicate directory not found');
    });
    runner.test('validateDirectoryAccess - 文件应该被拒绝', async () => {
        const testFile = (0, testUtils_1.createTestFile)(tempDir, 'not-a-dir.txt', 'content');
        const result = await securityManager.validateDirectoryAccess(testFile);
        testUtils_1.TestAssert.isFalse(result.granted, 'Should deny directory access to file');
        testUtils_1.TestAssert.contains(result.reason, 'not a directory', 'Should indicate not a directory');
    });
    // 测试安全上下文
    runner.test('getSecurityContext - 应该返回正确的上下文', () => {
        const context = securityManager.getSecurityContext();
        testUtils_1.TestAssert.equals(context.workspaceRoot, tempDir, 'Workspace root should match');
        testUtils_1.TestAssert.isArray(context.allowedPaths, 'Allowed paths should be array');
        testUtils_1.TestAssert.isArray(context.deniedPaths, 'Denied paths should be array');
        testUtils_1.TestAssert.isTrue(context.maxFileSize > 0, 'Max file size should be positive');
    });
    // 测试配置更新
    runner.test('updateSecurityContext - 应该更新配置', () => {
        const newMaxSize = 5 * 1024 * 1024; // 5MB
        securityManager.updateSecurityContext({ maxFileSize: newMaxSize });
        const context = securityManager.getSecurityContext();
        testUtils_1.TestAssert.equals(context.maxFileSize, newMaxSize, 'Max file size should be updated');
    });
    // 运行所有测试
    const results = await runner.run();
    return results;
}
exports.runSecurityManagerTests = runSecurityManagerTests;
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
        (0, mockVSCode_1.teardownMockEnvironment)();
    });
}
//# sourceMappingURL=securityManager.test.js.map