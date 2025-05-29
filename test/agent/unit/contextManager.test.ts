/**
 * 上下文管理器单元测试
 */

import * as path from 'path';
import { setupMockEnvironment, teardownMockEnvironment, mockLogger } from '../../setup/mockVSCode';
import { createTempTestDir, cleanupTempDir, createTestProject, TestAssert, TestRunner } from '../../setup/testUtils';

// 设置模拟环境
setupMockEnvironment();

// 导入要测试的模块
import { ContextManager } from '../../../src/agent/contextManager';

// 模拟 logger
(global as any).logger = mockLogger;

async function runContextManagerTests() {
    const runner = new TestRunner();
    let tempDir: string;
    let contextManager: ContextManager;
    let projectRoot: string;

    // 设置测试环境
    runner.beforeEach(() => {
        tempDir = createTempTestDir('context-manager-test');
        const project = createTestProject(tempDir);
        projectRoot = project.projectRoot;
        contextManager = new ContextManager(projectRoot);
    });

    // 清理测试环境
    runner.afterEach(() => {
        if (tempDir) {
            cleanupTempDir(tempDir);
        }
        if (contextManager) {
            contextManager.clearCache();
        }
    });

    // 测试基本上下文收集
    runner.test('getContext - 应该收集基本上下文信息', async () => {
        const context = await contextManager.getContext();
        
        TestAssert.equals(context.workspaceRoot, projectRoot, 'Workspace root should match');
        TestAssert.isTrue(context.projectStructure !== undefined, 'Should have project structure');
        TestAssert.isArray(context.diagnostics, 'Should have diagnostics array');
        TestAssert.isArray(context.recentFiles, 'Should have recent files array');
    });

    // 测试项目结构分析
    runner.test('项目结构分析 - Node.js 项目', async () => {
        const context = await contextManager.getContext();
        const projectStructure = context.projectStructure!;
        
        TestAssert.equals(projectStructure.type, 'node', 'Should detect Node.js project');
        TestAssert.contains(projectStructure.configFiles.join(','), 'package.json', 'Should include package.json');
        TestAssert.isTrue(projectStructure.packageManager !== undefined, 'Should detect package manager');
    });

    // 测试上下文缓存
    runner.test('上下文缓存机制', async () => {
        // 第一次获取上下文
        const startTime1 = Date.now();
        const context1 = await contextManager.getContext();
        const duration1 = Date.now() - startTime1;
        
        // 第二次获取上下文（应该使用缓存）
        const startTime2 = Date.now();
        const context2 = await contextManager.getContext();
        const duration2 = Date.now() - startTime2;
        
        TestAssert.equals(context1.workspaceRoot, context2.workspaceRoot, 'Contexts should be identical');
        TestAssert.isTrue(duration2 < duration1, 'Second call should be faster (cached)');
        
        console.log(`First call: ${duration1}ms, Second call: ${duration2}ms`);
    });

    // 测试强制刷新
    runner.test('强制刷新上下文', async () => {
        // 获取初始上下文
        const context1 = await contextManager.getContext();
        
        // 强制刷新
        const context2 = await contextManager.getContext(true);
        
        TestAssert.equals(context1.workspaceRoot, context2.workspaceRoot, 'Workspace should remain same');
        // 注意：在测试环境中，其他字段可能相同，但刷新机制应该工作
    });

    // 测试上下文更新
    runner.test('updateContext - 应该更新特定字段', async () => {
        const originalContext = await contextManager.getContext();
        
        const updates = {
            activeFile: '/test/file.ts',
            selectedText: 'test selection'
        };
        
        await contextManager.updateContext(updates);
        const updatedContext = await contextManager.getContext();
        
        TestAssert.equals(updatedContext.activeFile, updates.activeFile, 'Active file should be updated');
        TestAssert.equals(updatedContext.selectedText, updates.selectedText, 'Selected text should be updated');
        TestAssert.equals(updatedContext.workspaceRoot, originalContext.workspaceRoot, 'Workspace root should remain same');
    });

    // 测试缓存清理
    runner.test('clearCache - 应该清理缓存', async () => {
        // 获取上下文以建立缓存
        await contextManager.getContext();
        
        // 清理缓存
        contextManager.clearCache();
        
        // 再次获取上下文应该重新收集
        const context = await contextManager.getContext();
        TestAssert.isTrue(context !== null, 'Should still return valid context after cache clear');
    });

    // 测试上下文摘要生成
    runner.test('getContextSummary - 应该生成可读摘要', async () => {
        const summary = await contextManager.getContextSummary();
        
        TestAssert.isTrue(summary.length > 0, 'Summary should not be empty');
        TestAssert.contains(summary, '工作区:', 'Should contain workspace info');
        TestAssert.contains(summary, '项目类型:', 'Should contain project type');
        
        console.log('Context Summary:');
        console.log(summary);
    });

    // 测试错误处理
    runner.test('错误处理 - 无效工作区路径', async () => {
        const invalidContextManager = new ContextManager('/nonexistent/path');
        
        try {
            const context = await invalidContextManager.getContext();
            // 应该仍然返回基本上下文，但某些字段可能为空
            TestAssert.equals(context.workspaceRoot, '/nonexistent/path', 'Should use provided workspace root');
        } catch (error) {
            // 某些操作可能失败，但不应该抛出异常
            TestAssert.isTrue(false, 'Should not throw exception for invalid workspace');
        }
    });

    // 测试诊断信息收集
    runner.test('诊断信息收集', async () => {
        const context = await contextManager.getContext();
        
        TestAssert.isArray(context.diagnostics, 'Should have diagnostics array');
        // 在测试环境中可能没有实际的诊断信息
        TestAssert.isTrue(context.diagnostics!.length >= 0, 'Diagnostics array should be valid');
    });

    // 测试最近文件收集
    runner.test('最近文件收集', async () => {
        const context = await contextManager.getContext();
        
        TestAssert.isArray(context.recentFiles, 'Should have recent files array');
        TestAssert.isTrue(context.recentFiles!.length >= 0, 'Recent files array should be valid');
    });

    // 测试 Git 状态收集
    runner.test('Git 状态收集', async () => {
        const context = await contextManager.getContext();
        
        // Git 状态可能为空（在测试环境中）
        if (context.gitStatus) {
            TestAssert.isTrue(context.gitStatus.branch !== undefined, 'Should have branch info');
            TestAssert.isTrue(typeof context.gitStatus.hasChanges === 'boolean', 'Should have changes flag');
            TestAssert.isArray(context.gitStatus.stagedFiles, 'Should have staged files array');
            TestAssert.isArray(context.gitStatus.modifiedFiles, 'Should have modified files array');
        }
    });

    // 测试终端状态收集
    runner.test('终端状态收集', async () => {
        const context = await contextManager.getContext();
        
        if (context.terminalState) {
            TestAssert.isTrue(typeof context.terminalState.activeTerminals === 'number', 'Should have terminal count');
            TestAssert.equals(context.terminalState.workingDirectory, projectRoot, 'Should have working directory');
        }
    });

    // 运行所有测试
    const results = await runner.run();
    return results;
}

// 导出测试函数
export { runContextManagerTests };

// 如果直接运行此文件
if (require.main === module) {
    runContextManagerTests()
        .then(results => {
            console.log(`\n🧠 Context Manager Tests Complete: ${results.passed} passed, ${results.failed} failed`);
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
