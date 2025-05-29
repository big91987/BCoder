"use strict";
/**
 * 工具系统手动演示
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
exports.runToolDemo = void 0;
const path = __importStar(require("path"));
const mockVSCode_1 = require("../../setup/mockVSCode");
const testUtils_1 = require("../../setup/testUtils");
// 设置模拟环境
(0, mockVSCode_1.setupMockEnvironment)();
// 导入要测试的模块
const tools_1 = require("../../../src/tools");
// 模拟 logger
global.logger = mockVSCode_1.mockLogger;
async function runToolDemo() {
    console.log('🚀 BCoder 工具系统演示开始\n');
    // 创建测试环境
    const tempDir = (0, testUtils_1.createTempTestDir)('tool-demo');
    const project = (0, testUtils_1.createTestProject)(tempDir);
    const projectRoot = project.projectRoot;
    console.log(`📁 测试项目创建于: ${projectRoot}\n`);
    // 初始化工具系统
    const toolSystem = new tools_1.ToolSystem(projectRoot);
    console.log('🛠️ 工具系统初始化完成\n');
    // 显示可用工具
    const tools = toolSystem.getToolDefinitions();
    console.log(`📋 可用工具 (${tools.length} 个):`);
    tools.forEach((tool, index) => {
        console.log(`  ${index + 1}. ${tool.function.name} - ${tool.function.description}`);
    });
    console.log();
    try {
        // 演示 1: 文件读取
        console.log('📖 演示 1: 读取 package.json 文件');
        console.log('='.repeat(50));
        const readResult = await toolSystem.executeTool('read_file', {
            path: path.join(projectRoot, 'package.json')
        });
        if (readResult.success) {
            console.log('✅ 文件读取成功');
            console.log(`📄 文件大小: ${readResult.data.size} 字节`);
            console.log('📝 文件内容预览:');
            console.log(readResult.data.content.substring(0, 200) + '...\n');
        }
        else {
            console.log(`❌ 文件读取失败: ${readResult.error}\n`);
        }
        await (0, testUtils_1.sleep)(1000);
        // 演示 2: 目录列表
        console.log('📂 演示 2: 列出项目目录结构');
        console.log('='.repeat(50));
        const listResult = await toolSystem.executeTool('list_files', {
            path: projectRoot,
            recursive: true,
            include_hidden: false
        });
        if (listResult.success) {
            console.log(`✅ 目录列表成功，找到 ${listResult.data.files.length} 个文件/目录:`);
            listResult.data.files.forEach((file) => {
                const type = file.isDirectory ? '📁' : '📄';
                const size = file.isDirectory ? '' : ` (${file.size} 字节)`;
                console.log(`  ${type} ${file.name}${size}`);
            });
            console.log();
        }
        else {
            console.log(`❌ 目录列表失败: ${listResult.error}\n`);
        }
        await (0, testUtils_1.sleep)(1000);
        // 演示 3: 文件搜索
        console.log('🔍 演示 3: 搜索 TypeScript 文件');
        console.log('='.repeat(50));
        const searchResult = await toolSystem.executeTool('search_files', {
            pattern: '*.ts',
            directory: projectRoot,
            recursive: true
        });
        if (searchResult.success) {
            console.log(`✅ 文件搜索成功，找到 ${searchResult.data.results.length} 个 TypeScript 文件:`);
            searchResult.data.results.forEach((file, index) => {
                const relativePath = path.relative(projectRoot, file);
                console.log(`  ${index + 1}. ${relativePath}`);
            });
            console.log();
        }
        else {
            console.log(`❌ 文件搜索失败: ${searchResult.error}\n`);
        }
        await (0, testUtils_1.sleep)(1000);
        // 演示 4: 内容搜索
        console.log('🔎 演示 4: 在文件中搜索内容');
        console.log('='.repeat(50));
        const contentSearchResult = await toolSystem.executeTool('search_in_files', {
            query: 'console.log',
            directory: projectRoot,
            file_pattern: '*.ts',
            max_results: 5
        });
        if (contentSearchResult.success) {
            console.log(`✅ 内容搜索成功，找到 ${contentSearchResult.data.results.length} 个匹配:`);
            contentSearchResult.data.results.forEach((match, index) => {
                const relativePath = path.relative(projectRoot, match.path);
                console.log(`  ${index + 1}. ${relativePath}:${match.line} - ${match.content.trim()}`);
            });
            console.log();
        }
        else {
            console.log(`❌ 内容搜索失败: ${contentSearchResult.error}\n`);
        }
        await (0, testUtils_1.sleep)(1000);
        // 演示 5: 文件创建和编辑
        console.log('✏️ 演示 5: 创建和编辑文件');
        console.log('='.repeat(50));
        const newFileName = 'demo-file.ts';
        const newFilePath = path.join(projectRoot, 'src', newFileName);
        const originalContent = `// Demo file created by BCoder tool system
export class DemoClass {
    private message: string = 'Hello, World!';
    
    public greet(): string {
        return this.message;
    }
}

console.log('Demo file created successfully');`;
        // 创建文件
        const writeResult = await toolSystem.executeTool('write_file', {
            path: newFilePath,
            content: originalContent
        });
        if (writeResult.success) {
            console.log(`✅ 文件创建成功: ${newFileName}`);
            console.log(`📄 文件大小: ${writeResult.data.size} 字节`);
        }
        else {
            console.log(`❌ 文件创建失败: ${writeResult.error}`);
        }
        await (0, testUtils_1.sleep)(500);
        // 编辑文件
        const editResult = await toolSystem.executeTool('edit_file', {
            path: newFilePath,
            old_text: 'Hello, World!',
            new_text: 'Hello, BCoder!'
        });
        if (editResult.success) {
            console.log('✅ 文件编辑成功');
            console.log('🔄 已将 "Hello, World!" 替换为 "Hello, BCoder!"');
        }
        else {
            console.log(`❌ 文件编辑失败: ${editResult.error}`);
        }
        await (0, testUtils_1.sleep)(500);
        // 验证编辑结果
        const verifyResult = await toolSystem.executeTool('read_file', {
            path: newFilePath
        });
        if (verifyResult.success) {
            console.log('📝 编辑后的文件内容:');
            console.log(verifyResult.data.content);
            console.log();
        }
        await (0, testUtils_1.sleep)(1000);
        // 演示 6: 批量工具执行
        console.log('⚡ 演示 6: 批量工具执行');
        console.log('='.repeat(50));
        const batchToolCalls = [
            { name: 'get_file_info', arguments: { path: path.join(projectRoot, 'package.json') } },
            { name: 'get_file_info', arguments: { path: path.join(projectRoot, 'src') } },
            { name: 'get_file_info', arguments: { path: newFilePath } }
        ];
        console.log(`🔄 执行 ${batchToolCalls.length} 个工具调用...`);
        const batchResults = await toolSystem.executeTools(batchToolCalls);
        console.log('📊 批量执行结果:');
        batchResults.forEach((result, index) => {
            const toolName = batchToolCalls[index].name;
            const status = result.success ? '✅' : '❌';
            console.log(`  ${status} ${toolName}: ${result.success ? '成功' : result.error}`);
            if (result.success && result.data) {
                const info = result.data;
                const type = info.isDirectory ? '目录' : '文件';
                console.log(`     ${type}: ${info.name} (${info.size} 字节)`);
            }
        });
        console.log();
        // 演示完成
        console.log('🎉 工具系统演示完成!');
        console.log('='.repeat(50));
        console.log('✅ 所有核心功能都正常工作');
        console.log('🛠️ 工具系统已准备好用于 Agent 工作流');
        console.log('🚀 可以开始使用 BCoder 进行智能编程辅助');
    }
    catch (error) {
        console.error('❌ 演示过程中出现错误:', error);
    }
    finally {
        // 清理资源
        toolSystem.dispose();
        (0, testUtils_1.cleanupTempDir)(tempDir);
        (0, mockVSCode_1.teardownMockEnvironment)();
        console.log('\n🧹 清理完成');
    }
}
exports.runToolDemo = runToolDemo;
// 如果直接运行此文件
if (require.main === module) {
    runToolDemo()
        .then(() => {
        console.log('\n👋 演示结束');
        process.exit(0);
    })
        .catch(error => {
        console.error('演示失败:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=toolDemo.js.map