/**
 * 工具系统手动演示
 */

import * as path from 'path';
import { setupMockEnvironment, teardownMockEnvironment, mockLogger } from '../../setup/mockVSCode';
import { createTempTestDir, cleanupTempDir, createTestProject, sleep } from '../../setup/testUtils';

// 设置模拟环境
setupMockEnvironment();

// 导入要测试的模块
import { ToolSystem } from '../../../src/tools';

// 模拟 logger
(global as any).logger = mockLogger;

async function runToolDemo() {
    console.log('🚀 BCoder 工具系统演示开始\n');
    
    // 创建测试环境
    const tempDir = createTempTestDir('tool-demo');
    const project = createTestProject(tempDir);
    const projectRoot = project.projectRoot;
    
    console.log(`📁 测试项目创建于: ${projectRoot}\n`);
    
    // 初始化工具系统
    const toolSystem = new ToolSystem(projectRoot);
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
        console.log('=' .repeat(50));
        
        const readResult = await toolSystem.executeTool('read_file', {
            path: path.join(projectRoot, 'package.json')
        });
        
        if (readResult.success) {
            console.log('✅ 文件读取成功');
            console.log(`📄 文件大小: ${readResult.data.size} 字节`);
            console.log('📝 文件内容预览:');
            console.log(readResult.data.content.substring(0, 200) + '...\n');
        } else {
            console.log(`❌ 文件读取失败: ${readResult.error}\n`);
        }
        
        await sleep(1000);
        
        // 演示 2: 目录列表
        console.log('📂 演示 2: 列出项目目录结构');
        console.log('=' .repeat(50));
        
        const listResult = await toolSystem.executeTool('list_files', {
            path: projectRoot,
            recursive: true,
            include_hidden: false
        });
        
        if (listResult.success) {
            console.log(`✅ 目录列表成功，找到 ${listResult.data.files.length} 个文件/目录:`);
            listResult.data.files.forEach((file: any) => {
                const type = file.isDirectory ? '📁' : '📄';
                const size = file.isDirectory ? '' : ` (${file.size} 字节)`;
                console.log(`  ${type} ${file.name}${size}`);
            });
            console.log();
        } else {
            console.log(`❌ 目录列表失败: ${listResult.error}\n`);
        }
        
        await sleep(1000);
        
        // 演示 3: 文件搜索
        console.log('🔍 演示 3: 搜索 TypeScript 文件');
        console.log('=' .repeat(50));
        
        const searchResult = await toolSystem.executeTool('search_files', {
            pattern: '*.ts',
            directory: projectRoot,
            recursive: true
        });
        
        if (searchResult.success) {
            console.log(`✅ 文件搜索成功，找到 ${searchResult.data.results.length} 个 TypeScript 文件:`);
            searchResult.data.results.forEach((file: string, index: number) => {
                const relativePath = path.relative(projectRoot, file);
                console.log(`  ${index + 1}. ${relativePath}`);
            });
            console.log();
        } else {
            console.log(`❌ 文件搜索失败: ${searchResult.error}\n`);
        }
        
        await sleep(1000);
        
        // 演示 4: 内容搜索
        console.log('🔎 演示 4: 在文件中搜索内容');
        console.log('=' .repeat(50));
        
        const contentSearchResult = await toolSystem.executeTool('search_in_files', {
            query: 'console.log',
            directory: projectRoot,
            file_pattern: '*.ts',
            max_results: 5
        });
        
        if (contentSearchResult.success) {
            console.log(`✅ 内容搜索成功，找到 ${contentSearchResult.data.results.length} 个匹配:`);
            contentSearchResult.data.results.forEach((match: any, index: number) => {
                const relativePath = path.relative(projectRoot, match.path);
                console.log(`  ${index + 1}. ${relativePath}:${match.line} - ${match.content.trim()}`);
            });
            console.log();
        } else {
            console.log(`❌ 内容搜索失败: ${contentSearchResult.error}\n`);
        }
        
        await sleep(1000);
        
        // 演示 5: 文件创建和编辑
        console.log('✏️ 演示 5: 创建和编辑文件');
        console.log('=' .repeat(50));
        
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
        } else {
            console.log(`❌ 文件创建失败: ${writeResult.error}`);
        }
        
        await sleep(500);
        
        // 编辑文件
        const editResult = await toolSystem.executeTool('edit_file', {
            path: newFilePath,
            old_text: 'Hello, World!',
            new_text: 'Hello, BCoder!'
        });
        
        if (editResult.success) {
            console.log('✅ 文件编辑成功');
            console.log('🔄 已将 "Hello, World!" 替换为 "Hello, BCoder!"');
        } else {
            console.log(`❌ 文件编辑失败: ${editResult.error}`);
        }
        
        await sleep(500);
        
        // 验证编辑结果
        const verifyResult = await toolSystem.executeTool('read_file', {
            path: newFilePath
        });
        
        if (verifyResult.success) {
            console.log('📝 编辑后的文件内容:');
            console.log(verifyResult.data.content);
            console.log();
        }
        
        await sleep(1000);
        
        // 演示 6: 批量工具执行
        console.log('⚡ 演示 6: 批量工具执行');
        console.log('=' .repeat(50));
        
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
        console.log('=' .repeat(50));
        console.log('✅ 所有核心功能都正常工作');
        console.log('🛠️ 工具系统已准备好用于 Agent 工作流');
        console.log('🚀 可以开始使用 BCoder 进行智能编程辅助');
        
    } catch (error) {
        console.error('❌ 演示过程中出现错误:', error);
    } finally {
        // 清理资源
        toolSystem.dispose();
        cleanupTempDir(tempDir);
        teardownMockEnvironment();
        
        console.log('\n🧹 清理完成');
    }
}

// 导出演示函数
export { runToolDemo };

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
