"use strict";
/**
 * 工具系统集成测试
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
exports.runToolSystemIntegrationTests = void 0;
const path = __importStar(require("path"));
const mockVSCode_1 = require("../../setup/mockVSCode");
const testUtils_1 = require("../../setup/testUtils");
// 设置模拟环境
(0, mockVSCode_1.setupMockEnvironment)();
// 导入要测试的模块
const tools_1 = require("../../../src/tools");
// 模拟 logger
global.logger = mockVSCode_1.mockLogger;
async function runToolSystemIntegrationTests() {
    const runner = new testUtils_1.TestRunner();
    let tempDir;
    let toolSystem;
    let projectRoot;
    // 设置测试环境
    runner.beforeEach(() => {
        tempDir = (0, testUtils_1.createTempTestDir)('tool-system-test');
        const project = (0, testUtils_1.createTestProject)(tempDir);
        projectRoot = project.projectRoot;
        toolSystem = new tools_1.ToolSystem(projectRoot);
    });
    // 清理测试环境
    runner.afterEach(() => {
        if (tempDir) {
            (0, testUtils_1.cleanupTempDir)(tempDir);
        }
        if (toolSystem) {
            toolSystem.dispose();
        }
    });
    // 测试工具系统初始化
    runner.test('ToolSystem - 初始化应该成功', () => {
        testUtils_1.TestAssert.isTrue(toolSystem !== null, 'Tool system should be initialized');
        const tools = toolSystem.getToolDefinitions();
        testUtils_1.TestAssert.isArray(tools, 'Should return tool definitions array');
        testUtils_1.TestAssert.isTrue(tools.length > 0, 'Should have registered tools');
        console.log(`Registered ${tools.length} tools:`, tools.map(t => t.function.name));
    });
    // 测试文件读取工作流
    runner.test('文件读取工作流', async () => {
        // 读取 package.json
        const result = await toolSystem.executeTool('read_file', {
            path: path.join(projectRoot, 'package.json')
        });
        testUtils_1.TestAssert.isTrue(result.success, 'Should successfully read package.json');
        testUtils_1.TestAssert.contains(result.data.content, 'test-project', 'Should contain project name');
        testUtils_1.TestAssert.isTrue(result.data.size > 0, 'Should have content size');
    });
    // 测试目录列表工作流
    runner.test('目录列表工作流', async () => {
        // 列出项目根目录
        const result = await toolSystem.executeTool('list_files', {
            path: projectRoot,
            recursive: false
        });
        testUtils_1.TestAssert.isTrue(result.success, 'Should successfully list files');
        testUtils_1.TestAssert.isArray(result.data.files, 'Should return files array');
        testUtils_1.TestAssert.isTrue(result.data.files.length > 0, 'Should have files');
        // 检查是否包含预期文件
        const fileNames = result.data.files.map((f) => f.name);
        testUtils_1.TestAssert.contains(fileNames.join(','), 'package.json', 'Should contain package.json');
        testUtils_1.TestAssert.contains(fileNames.join(','), 'src', 'Should contain src directory');
    });
    // 测试文件搜索工作流
    runner.test('文件搜索工作流', async () => {
        // 搜索 TypeScript 文件
        const result = await toolSystem.executeTool('search_files', {
            pattern: '*.ts',
            directory: projectRoot,
            recursive: true
        });
        testUtils_1.TestAssert.isTrue(result.success, 'Should successfully search files');
        testUtils_1.TestAssert.isArray(result.data.results, 'Should return results array');
        testUtils_1.TestAssert.isTrue(result.data.results.length > 0, 'Should find TypeScript files');
        // 验证找到的文件确实是 .ts 文件
        const tsFiles = result.data.results.filter((file) => file.endsWith('.ts'));
        testUtils_1.TestAssert.equals(tsFiles.length, result.data.results.length, 'All results should be .ts files');
    });
    // 测试内容搜索工作流
    runner.test('内容搜索工作流', async () => {
        // 在文件中搜索特定内容
        const result = await toolSystem.executeTool('search_in_files', {
            query: 'console.log',
            directory: projectRoot,
            file_pattern: '*.ts',
            max_results: 10
        });
        testUtils_1.TestAssert.isTrue(result.success, 'Should successfully search in files');
        testUtils_1.TestAssert.isArray(result.data.results, 'Should return results array');
        if (result.data.results.length > 0) {
            const firstResult = result.data.results[0];
            testUtils_1.TestAssert.isTrue(firstResult.line > 0, 'Should have valid line number');
            testUtils_1.TestAssert.contains(firstResult.content, 'console.log', 'Should contain search term');
        }
    });
    // 测试文件创建和编辑工作流
    runner.test('文件创建和编辑工作流', async () => {
        const testFileName = 'test-workflow.ts';
        const testFilePath = path.join(projectRoot, 'src', testFileName);
        const originalContent = `// Test file created by workflow
export function testFunction(): string {
    return 'original';
}`;
        // 1. 创建文件
        const writeResult = await toolSystem.executeTool('write_file', {
            path: testFilePath,
            content: originalContent
        });
        testUtils_1.TestAssert.isTrue(writeResult.success, 'Should successfully create file');
        // 2. 读取文件验证
        const readResult = await toolSystem.executeTool('read_file', {
            path: testFilePath
        });
        testUtils_1.TestAssert.isTrue(readResult.success, 'Should successfully read created file');
        testUtils_1.TestAssert.equals(readResult.data.content, originalContent, 'Content should match');
        // 3. 编辑文件
        const editResult = await toolSystem.executeTool('edit_file', {
            path: testFilePath,
            old_text: 'original',
            new_text: 'modified'
        });
        testUtils_1.TestAssert.isTrue(editResult.success, 'Should successfully edit file');
        // 4. 验证编辑结果
        const readAfterEditResult = await toolSystem.executeTool('read_file', {
            path: testFilePath
        });
        testUtils_1.TestAssert.isTrue(readAfterEditResult.success, 'Should successfully read edited file');
        testUtils_1.TestAssert.contains(readAfterEditResult.data.content, 'modified', 'Should contain modified text');
        testUtils_1.TestAssert.notContains(readAfterEditResult.data.content, 'original', 'Should not contain original text');
    });
    // 测试目录操作工作流
    runner.test('目录操作工作流', async () => {
        const newDirPath = path.join(projectRoot, 'new-directory');
        const testFilePath = path.join(newDirPath, 'test.txt');
        // 1. 创建目录
        const createDirResult = await toolSystem.executeTool('create_directory', {
            path: newDirPath
        });
        testUtils_1.TestAssert.isTrue(createDirResult.success, 'Should successfully create directory');
        // 2. 在新目录中创建文件
        const createFileResult = await toolSystem.executeTool('write_file', {
            path: testFilePath,
            content: 'Test content in new directory'
        });
        testUtils_1.TestAssert.isTrue(createFileResult.success, 'Should successfully create file in new directory');
        // 3. 列出新目录内容
        const listResult = await toolSystem.executeTool('list_files', {
            path: newDirPath
        });
        testUtils_1.TestAssert.isTrue(listResult.success, 'Should successfully list new directory');
        testUtils_1.TestAssert.isTrue(listResult.data.files.length > 0, 'Should have files in new directory');
    });
    // 测试错误处理
    runner.test('错误处理测试', async () => {
        // 测试读取不存在的文件
        const readResult = await toolSystem.executeTool('read_file', {
            path: path.join(projectRoot, 'nonexistent.txt')
        });
        testUtils_1.TestAssert.isFalse(readResult.success, 'Should fail to read non-existent file');
        testUtils_1.TestAssert.isTrue(readResult.error !== undefined, 'Should have error message');
        // 测试无效的工具名称
        const invalidToolResult = await toolSystem.executeTool('invalid_tool', {});
        testUtils_1.TestAssert.isFalse(invalidToolResult.success, 'Should fail for invalid tool');
        testUtils_1.TestAssert.contains(invalidToolResult.error, 'not found', 'Should indicate tool not found');
    });
    // 测试批量工具执行
    runner.test('批量工具执行', async () => {
        const toolCalls = [
            { name: 'read_file', arguments: { path: path.join(projectRoot, 'package.json') } },
            { name: 'list_files', arguments: { path: projectRoot, recursive: false } },
            { name: 'get_file_info', arguments: { path: path.join(projectRoot, 'README.md') } }
        ];
        const results = await toolSystem.executeTools(toolCalls);
        testUtils_1.TestAssert.isArray(results, 'Should return results array');
        testUtils_1.TestAssert.equals(results.length, toolCalls.length, 'Should have result for each tool call');
        // 检查每个结果
        results.forEach((result, index) => {
            console.log(`Tool ${toolCalls[index].name}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
        });
    });
    // 运行所有测试
    const results = await runner.run();
    return results;
}
exports.runToolSystemIntegrationTests = runToolSystemIntegrationTests;
// 如果直接运行此文件
if (require.main === module) {
    runToolSystemIntegrationTests()
        .then(results => {
        console.log(`\n🔧 Tool System Integration Tests Complete: ${results.passed} passed, ${results.failed} failed`);
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
//# sourceMappingURL=toolSystem.test.js.map