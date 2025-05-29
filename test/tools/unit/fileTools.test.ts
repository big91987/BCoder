/**
 * 文件工具单元测试
 */

import * as path from 'path';
import { setupMockEnvironment, teardownMockEnvironment, mockLogger } from '../../setup/mockVSCode';
import { createTempTestDir, cleanupTempDir, createTestFile, TestAssert, TestRunner } from '../../setup/testUtils';

// 设置模拟环境
setupMockEnvironment();

// 导入要测试的模块
import { ReadFileTool, WriteFileTool, EditFileTool, GetFileInfoTool } from '../../../src/tools/fileTools';
import { SecurityManager } from '../../../src/security/securityManager';

// 模拟 logger
(global as any).logger = mockLogger;

async function runFileToolsTests() {
    const runner = new TestRunner();
    let tempDir: string;
    let securityManager: SecurityManager;

    // 设置测试环境
    runner.beforeEach(() => {
        tempDir = createTempTestDir('file-tools-test');
        securityManager = new SecurityManager(tempDir);
    });

    // 清理测试环境
    runner.afterEach(() => {
        if (tempDir) {
            cleanupTempDir(tempDir);
        }
    });

    // 测试 ReadFileTool
    runner.test('ReadFileTool - 成功读取文件', async () => {
        const testContent = 'Hello, World!\nThis is a test file.';
        const testFile = createTestFile(tempDir, 'test.txt', testContent);
        
        const readTool = new ReadFileTool(securityManager);
        const result = await readTool.execute({ path: testFile });
        
        TestAssert.isTrue(result.success, 'Should succeed');
        TestAssert.equals(result.data.content, testContent, 'Content should match');
        TestAssert.equals(result.data.size, testContent.length, 'Size should match');
    });

    runner.test('ReadFileTool - 文件不存在', async () => {
        const readTool = new ReadFileTool(securityManager);
        const result = await readTool.execute({ path: path.join(tempDir, 'nonexistent.txt') });
        
        TestAssert.isFalse(result.success, 'Should fail');
        TestAssert.contains(result.error!, 'does not exist', 'Should indicate file not found');
    });

    runner.test('ReadFileTool - 路径安全检查', async () => {
        const readTool = new ReadFileTool(securityManager);
        const result = await readTool.execute({ path: '/etc/passwd' });
        
        TestAssert.isFalse(result.success, 'Should fail for unsafe path');
        TestAssert.contains(result.error!, 'Permission denied', 'Should indicate permission denied');
    });

    // 测试 WriteFileTool
    runner.test('WriteFileTool - 成功写入文件', async () => {
        const testContent = 'New file content\nLine 2';
        const testFile = path.join(tempDir, 'new-file.txt');
        
        const writeTool = new WriteFileTool(securityManager);
        const result = await writeTool.execute({ 
            path: testFile, 
            content: testContent 
        });
        
        TestAssert.isTrue(result.success, 'Should succeed');
        TestAssert.equals(result.data.size, testContent.length, 'Size should match');
        
        // 验证文件确实被创建
        const readTool = new ReadFileTool(securityManager);
        const readResult = await readTool.execute({ path: testFile });
        TestAssert.isTrue(readResult.success, 'Should be able to read written file');
        TestAssert.equals(readResult.data.content, testContent, 'Written content should match');
    });

    runner.test('WriteFileTool - 创建子目录', async () => {
        const testContent = 'Content in subdirectory';
        const testFile = path.join(tempDir, 'subdir', 'file.txt');
        
        const writeTool = new WriteFileTool(securityManager);
        const result = await writeTool.execute({ 
            path: testFile, 
            content: testContent 
        });
        
        TestAssert.isTrue(result.success, 'Should succeed');
        
        // 验证文件和目录都被创建
        const readTool = new ReadFileTool(securityManager);
        const readResult = await readTool.execute({ path: testFile });
        TestAssert.isTrue(readResult.success, 'Should be able to read file in subdirectory');
    });

    // 测试 EditFileTool
    runner.test('EditFileTool - 成功编辑文件', async () => {
        const originalContent = 'Hello World\nThis is original content';
        const testFile = createTestFile(tempDir, 'edit-test.txt', originalContent);
        
        const editTool = new EditFileTool(securityManager);
        const result = await editTool.execute({
            path: testFile,
            old_text: 'original',
            new_text: 'modified'
        });
        
        TestAssert.isTrue(result.success, 'Should succeed');
        
        // 验证内容被修改
        const readTool = new ReadFileTool(securityManager);
        const readResult = await readTool.execute({ path: testFile });
        TestAssert.contains(readResult.data.content, 'modified', 'Should contain new text');
        TestAssert.notContains(readResult.data.content, 'original', 'Should not contain old text');
    });

    runner.test('EditFileTool - 文本未找到', async () => {
        const originalContent = 'Hello World';
        const testFile = createTestFile(tempDir, 'edit-test.txt', originalContent);
        
        const editTool = new EditFileTool(securityManager);
        const result = await editTool.execute({
            path: testFile,
            old_text: 'nonexistent',
            new_text: 'replacement'
        });
        
        TestAssert.isFalse(result.success, 'Should fail');
        TestAssert.contains(result.error!, 'not found', 'Should indicate text not found');
    });

    // 测试 GetFileInfoTool
    runner.test('GetFileInfoTool - 获取文件信息', async () => {
        const testContent = 'Test content for file info';
        const testFile = createTestFile(tempDir, 'info-test.txt', testContent);
        
        const infoTool = new GetFileInfoTool(securityManager);
        const result = await infoTool.execute({ path: testFile });
        
        TestAssert.isTrue(result.success, 'Should succeed');
        TestAssert.equals(result.data.name, 'info-test.txt', 'Name should match');
        TestAssert.equals(result.data.size, testContent.length, 'Size should match');
        TestAssert.isFalse(result.data.isDirectory, 'Should not be directory');
        TestAssert.equals(result.data.extension, '.txt', 'Extension should match');
    });

    runner.test('GetFileInfoTool - 获取目录信息', async () => {
        const testDir = path.join(tempDir, 'test-directory');
        createTestFile(tempDir, 'test-directory/dummy.txt', 'dummy');
        
        const infoTool = new GetFileInfoTool(securityManager);
        const result = await infoTool.execute({ path: testDir });
        
        TestAssert.isTrue(result.success, 'Should succeed');
        TestAssert.equals(result.data.name, 'test-directory', 'Name should match');
        TestAssert.isTrue(result.data.isDirectory, 'Should be directory');
    });

    // 运行所有测试
    const results = await runner.run();
    return results;
}

// 导出测试函数
export { runFileToolsTests };

// 如果直接运行此文件
if (require.main === module) {
    runFileToolsTests()
        .then(results => {
            console.log(`\n🎯 File Tools Tests Complete: ${results.passed} passed, ${results.failed} failed`);
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
