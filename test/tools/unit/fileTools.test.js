"use strict";
/**
 * 文件工具单元测试
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
exports.runFileToolsTests = void 0;
const path = __importStar(require("path"));
const mockVSCode_1 = require("../../setup/mockVSCode");
const testUtils_1 = require("../../setup/testUtils");
// 设置模拟环境
(0, mockVSCode_1.setupMockEnvironment)();
// 导入要测试的模块
const fileTools_1 = require("../../../src/tools/fileTools");
const securityManager_1 = require("../../../src/security/securityManager");
// 模拟 logger
global.logger = mockVSCode_1.mockLogger;
async function runFileToolsTests() {
    const runner = new testUtils_1.TestRunner();
    let tempDir;
    let securityManager;
    // 设置测试环境
    runner.beforeEach(() => {
        tempDir = (0, testUtils_1.createTempTestDir)('file-tools-test');
        securityManager = new securityManager_1.SecurityManager(tempDir);
    });
    // 清理测试环境
    runner.afterEach(() => {
        if (tempDir) {
            (0, testUtils_1.cleanupTempDir)(tempDir);
        }
    });
    // 测试 ReadFileTool
    runner.test('ReadFileTool - 成功读取文件', async () => {
        const testContent = 'Hello, World!\nThis is a test file.';
        const testFile = (0, testUtils_1.createTestFile)(tempDir, 'test.txt', testContent);
        const readTool = new fileTools_1.ReadFileTool(securityManager);
        const result = await readTool.execute({ path: testFile });
        testUtils_1.TestAssert.isTrue(result.success, 'Should succeed');
        testUtils_1.TestAssert.equals(result.data.content, testContent, 'Content should match');
        testUtils_1.TestAssert.equals(result.data.size, testContent.length, 'Size should match');
    });
    runner.test('ReadFileTool - 文件不存在', async () => {
        const readTool = new fileTools_1.ReadFileTool(securityManager);
        const result = await readTool.execute({ path: path.join(tempDir, 'nonexistent.txt') });
        testUtils_1.TestAssert.isFalse(result.success, 'Should fail');
        testUtils_1.TestAssert.contains(result.error, 'does not exist', 'Should indicate file not found');
    });
    runner.test('ReadFileTool - 路径安全检查', async () => {
        const readTool = new fileTools_1.ReadFileTool(securityManager);
        const result = await readTool.execute({ path: '/etc/passwd' });
        testUtils_1.TestAssert.isFalse(result.success, 'Should fail for unsafe path');
        testUtils_1.TestAssert.contains(result.error, 'Permission denied', 'Should indicate permission denied');
    });
    // 测试 WriteFileTool
    runner.test('WriteFileTool - 成功写入文件', async () => {
        const testContent = 'New file content\nLine 2';
        const testFile = path.join(tempDir, 'new-file.txt');
        const writeTool = new fileTools_1.WriteFileTool(securityManager);
        const result = await writeTool.execute({
            path: testFile,
            content: testContent
        });
        testUtils_1.TestAssert.isTrue(result.success, 'Should succeed');
        testUtils_1.TestAssert.equals(result.data.size, testContent.length, 'Size should match');
        // 验证文件确实被创建
        const readTool = new fileTools_1.ReadFileTool(securityManager);
        const readResult = await readTool.execute({ path: testFile });
        testUtils_1.TestAssert.isTrue(readResult.success, 'Should be able to read written file');
        testUtils_1.TestAssert.equals(readResult.data.content, testContent, 'Written content should match');
    });
    runner.test('WriteFileTool - 创建子目录', async () => {
        const testContent = 'Content in subdirectory';
        const testFile = path.join(tempDir, 'subdir', 'file.txt');
        const writeTool = new fileTools_1.WriteFileTool(securityManager);
        const result = await writeTool.execute({
            path: testFile,
            content: testContent
        });
        testUtils_1.TestAssert.isTrue(result.success, 'Should succeed');
        // 验证文件和目录都被创建
        const readTool = new fileTools_1.ReadFileTool(securityManager);
        const readResult = await readTool.execute({ path: testFile });
        testUtils_1.TestAssert.isTrue(readResult.success, 'Should be able to read file in subdirectory');
    });
    // 测试 EditFileTool
    runner.test('EditFileTool - 成功编辑文件', async () => {
        const originalContent = 'Hello World\nThis is original content';
        const testFile = (0, testUtils_1.createTestFile)(tempDir, 'edit-test.txt', originalContent);
        const editTool = new fileTools_1.EditFileTool(securityManager);
        const result = await editTool.execute({
            path: testFile,
            old_text: 'original',
            new_text: 'modified'
        });
        testUtils_1.TestAssert.isTrue(result.success, 'Should succeed');
        // 验证内容被修改
        const readTool = new fileTools_1.ReadFileTool(securityManager);
        const readResult = await readTool.execute({ path: testFile });
        testUtils_1.TestAssert.contains(readResult.data.content, 'modified', 'Should contain new text');
        testUtils_1.TestAssert.notContains(readResult.data.content, 'original', 'Should not contain old text');
    });
    runner.test('EditFileTool - 文本未找到', async () => {
        const originalContent = 'Hello World';
        const testFile = (0, testUtils_1.createTestFile)(tempDir, 'edit-test.txt', originalContent);
        const editTool = new fileTools_1.EditFileTool(securityManager);
        const result = await editTool.execute({
            path: testFile,
            old_text: 'nonexistent',
            new_text: 'replacement'
        });
        testUtils_1.TestAssert.isFalse(result.success, 'Should fail');
        testUtils_1.TestAssert.contains(result.error, 'not found', 'Should indicate text not found');
    });
    // 测试 GetFileInfoTool
    runner.test('GetFileInfoTool - 获取文件信息', async () => {
        const testContent = 'Test content for file info';
        const testFile = (0, testUtils_1.createTestFile)(tempDir, 'info-test.txt', testContent);
        const infoTool = new fileTools_1.GetFileInfoTool(securityManager);
        const result = await infoTool.execute({ path: testFile });
        testUtils_1.TestAssert.isTrue(result.success, 'Should succeed');
        testUtils_1.TestAssert.equals(result.data.name, 'info-test.txt', 'Name should match');
        testUtils_1.TestAssert.equals(result.data.size, testContent.length, 'Size should match');
        testUtils_1.TestAssert.isFalse(result.data.isDirectory, 'Should not be directory');
        testUtils_1.TestAssert.equals(result.data.extension, '.txt', 'Extension should match');
    });
    runner.test('GetFileInfoTool - 获取目录信息', async () => {
        const testDir = path.join(tempDir, 'test-directory');
        (0, testUtils_1.createTestFile)(tempDir, 'test-directory/dummy.txt', 'dummy');
        const infoTool = new fileTools_1.GetFileInfoTool(securityManager);
        const result = await infoTool.execute({ path: testDir });
        testUtils_1.TestAssert.isTrue(result.success, 'Should succeed');
        testUtils_1.TestAssert.equals(result.data.name, 'test-directory', 'Name should match');
        testUtils_1.TestAssert.isTrue(result.data.isDirectory, 'Should be directory');
    });
    // 运行所有测试
    const results = await runner.run();
    return results;
}
exports.runFileToolsTests = runFileToolsTests;
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
        (0, mockVSCode_1.teardownMockEnvironment)();
    });
}
//# sourceMappingURL=fileTools.test.js.map