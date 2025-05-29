"use strict";
/**
 * Agent 系统集成测试
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAgentSystemIntegrationTests = void 0;
const mockVSCode_1 = require("../../setup/mockVSCode");
const testUtils_1 = require("../../setup/testUtils");
// 设置模拟环境
(0, mockVSCode_1.setupMockEnvironment)();
// 导入要测试的模块
const agent_1 = require("../../../src/agent");
const tools_1 = require("../../../src/tools");
// 模拟 logger
global.logger = mockVSCode_1.mockLogger;
async function runAgentSystemIntegrationTests() {
    const runner = new testUtils_1.TestRunner();
    let tempDir;
    let agentSystem;
    let toolSystem;
    let projectRoot;
    let aiClient;
    // 设置测试环境
    runner.beforeEach(() => {
        tempDir = (0, testUtils_1.createTempTestDir)('agent-system-test');
        const project = (0, testUtils_1.createTestProject)(tempDir);
        projectRoot = project.projectRoot;
        // 创建工具系统和 AI 客户端
        toolSystem = new tools_1.ToolSystem(projectRoot);
        aiClient = new mockVSCode_1.MockAIClient();
        // 创建 Agent 系统
        agentSystem = new agent_1.AgentSystem(toolSystem, aiClient, projectRoot);
    });
    // 清理测试环境
    runner.afterEach(() => {
        if (tempDir) {
            (0, testUtils_1.cleanupTempDir)(tempDir);
        }
        if (agentSystem) {
            agentSystem.dispose();
        }
        if (toolSystem) {
            toolSystem.dispose();
        }
    });
    // 测试 Agent 系统初始化
    runner.test('AgentSystem - 初始化应该成功', () => {
        testUtils_1.TestAssert.isTrue(agentSystem !== null, 'Agent system should be initialized');
        const config = agentSystem.getConfig();
        testUtils_1.TestAssert.isTrue(config.maxStepsPerTask > 0, 'Should have valid max steps');
        testUtils_1.TestAssert.isTrue(config.maxExecutionTime > 0, 'Should have valid max execution time');
        testUtils_1.TestAssert.isTrue(typeof config.enableReflection === 'boolean', 'Should have reflection setting');
    });
    // 测试简单请求处理
    runner.test('简单请求处理', async () => {
        const userRequest = '读取 package.json 文件';
        const result = await agentSystem.processRequest(userRequest);
        testUtils_1.TestAssert.isTrue(result.length > 0, 'Should return non-empty response');
        testUtils_1.TestAssert.contains(result, '理解', 'Should acknowledge understanding');
        console.log('Agent Response:', result);
    });
    // 测试复杂任务处理
    runner.test('复杂任务处理 - 功能实现', async () => {
        const userRequest = '实现一个简单的用户管理功能';
        // 设置回调来监控执行过程
        let taskStarted = false;
        let taskCompleted = false;
        let stepsExecuted = 0;
        const callbacks = {
            onTaskStarted: (task) => {
                taskStarted = true;
                console.log(`Task started: ${task.description}`);
            },
            onTaskCompleted: (task, reflection) => {
                taskCompleted = true;
                console.log(`Task completed: ${task.id}, success: ${reflection.success}`);
            },
            onStepStarted: (step) => {
                console.log(`Step started: ${step.description}`);
            },
            onStepCompleted: (step, result) => {
                stepsExecuted++;
                console.log(`Step completed: ${step.id}, success: ${result.success}`);
            },
            onProgress: (progress, message) => {
                console.log(`Progress: ${progress.toFixed(1)}% - ${message}`);
            }
        };
        const result = await agentSystem.processRequest(userRequest, callbacks);
        testUtils_1.TestAssert.isTrue(result.length > 0, 'Should return response');
        testUtils_1.TestAssert.isTrue(taskStarted, 'Should have started task');
        console.log('Complex Task Result:', result);
    });
    // 测试 Agent 创建
    runner.test('Agent 创建和配置', async () => {
        const agent = await agentSystem.createAgent();
        testUtils_1.TestAssert.isTrue(agent !== null, 'Should create agent');
        const state = agent.getState();
        testUtils_1.TestAssert.equals(state.context.workspaceRoot, projectRoot, 'Should have correct workspace');
        testUtils_1.TestAssert.isFalse(state.isActive, 'Should not be active initially');
        testUtils_1.TestAssert.isArray(state.executionHistory, 'Should have execution history');
    });
    // 测试配置更新
    runner.test('配置更新', () => {
        const originalConfig = agentSystem.getConfig();
        const updates = {
            maxStepsPerTask: 15,
            enableReflection: false,
            debugMode: true
        };
        agentSystem.updateConfig(updates);
        const updatedConfig = agentSystem.getConfig();
        testUtils_1.TestAssert.equals(updatedConfig.maxStepsPerTask, 15, 'Should update max steps');
        testUtils_1.TestAssert.isFalse(updatedConfig.enableReflection, 'Should update reflection setting');
        testUtils_1.TestAssert.isTrue(updatedConfig.debugMode, 'Should update debug mode');
    });
    // 测试状态摘要
    runner.test('状态摘要生成', async () => {
        // 先创建一个 Agent
        await agentSystem.createAgent();
        const summary = agentSystem.getStatusSummary();
        testUtils_1.TestAssert.isTrue(summary.length > 0, 'Summary should not be empty');
        testUtils_1.TestAssert.contains(summary, 'BCoder Agent 状态', 'Should contain status header');
        testUtils_1.TestAssert.contains(summary, '工作区:', 'Should contain workspace info');
        testUtils_1.TestAssert.contains(summary, '配置:', 'Should contain config info');
        console.log('Agent Status Summary:');
        console.log(summary);
    });
    // 测试错误处理
    runner.test('错误处理 - 无效请求', async () => {
        const invalidRequest = '';
        const result = await agentSystem.processRequest(invalidRequest);
        testUtils_1.TestAssert.isTrue(result.length > 0, 'Should return error response');
        // 应该优雅地处理空请求
    });
    // 测试并发请求处理
    runner.test('并发请求处理', async () => {
        const requests = [
            '读取 README.md',
            '列出 src 目录',
            '搜索 TypeScript 文件'
        ];
        // 并发发送请求
        const promises = requests.map(request => agentSystem.processRequest(request));
        const results = await Promise.all(promises);
        testUtils_1.TestAssert.equals(results.length, requests.length, 'Should handle all requests');
        results.forEach((result, index) => {
            testUtils_1.TestAssert.isTrue(result.length > 0, `Request ${index + 1} should have response`);
        });
    });
    // 测试 Agent 停止和清理
    runner.test('Agent 停止和清理', async () => {
        const agent = await agentSystem.createAgent();
        // 停止 Agent
        agentSystem.stop();
        const state = agent.getState();
        testUtils_1.TestAssert.isFalse(state.isActive, 'Agent should be stopped');
        // 清理资源
        agentSystem.dispose();
        // 验证清理后的状态
        const currentAgent = agentSystem.getAgent();
        // Agent 可能仍然存在但应该已停止
    });
    // 测试事件监听
    runner.test('事件监听机制', async () => {
        let eventsReceived = 0;
        const callbacks = {
            onTaskStarted: () => eventsReceived++,
            onTaskCompleted: () => eventsReceived++,
            onStepStarted: () => eventsReceived++,
            onStepCompleted: () => eventsReceived++,
            onProgress: () => eventsReceived++
        };
        await agentSystem.processRequest('简单测试任务', callbacks);
        testUtils_1.TestAssert.isTrue(eventsReceived > 0, 'Should receive events');
        console.log(`Received ${eventsReceived} events`);
    });
    // 测试长时间运行任务
    runner.test('长时间运行任务处理', async () => {
        // 设置较短的超时时间进行测试
        agentSystem.updateConfig({ maxExecutionTime: 1000 }); // 1秒
        const longRunningRequest = '执行一个复杂的重构任务';
        const startTime = Date.now();
        const result = await agentSystem.processRequest(longRunningRequest);
        const duration = Date.now() - startTime;
        testUtils_1.TestAssert.isTrue(result.length > 0, 'Should return response even for long tasks');
        console.log(`Task completed in ${duration}ms`);
    });
    // 运行所有测试
    const results = await runner.run();
    return results;
}
exports.runAgentSystemIntegrationTests = runAgentSystemIntegrationTests;
// 如果直接运行此文件
if (require.main === module) {
    runAgentSystemIntegrationTests()
        .then(results => {
        console.log(`\n🤖 Agent System Integration Tests Complete: ${results.passed} passed, ${results.failed} failed`);
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
//# sourceMappingURL=agentSystem.test.js.map