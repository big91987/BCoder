/**
 * 运行所有测试的主脚本
 */

import { setupMockEnvironment, teardownMockEnvironment } from './setup/mockVSCode';

// 导入所有测试
import { runFileToolsTests } from './tools/unit/fileTools.test';
import { runSecurityManagerTests } from './tools/unit/securityManager.test';
import { runToolSystemIntegrationTests } from './tools/integration/toolSystem.test';
import { runContextManagerTests } from './agent/unit/contextManager.test';
import { runAgentSystemIntegrationTests } from './agent/integration/agentSystem.test';

// 导入演示
import { runToolDemo } from './tools/manual/toolDemo';

interface TestSuite {
    name: string;
    category: 'tools' | 'agent' | 'integration' | 'demo';
    run: () => Promise<{ passed: number; failed: number }>;
}

const testSuites: TestSuite[] = [
    // 工具系统测试
    {
        name: '文件工具单元测试',
        category: 'tools',
        run: runFileToolsTests
    },
    {
        name: '安全管理器单元测试',
        category: 'tools',
        run: runSecurityManagerTests
    },
    {
        name: '工具系统集成测试',
        category: 'integration',
        run: runToolSystemIntegrationTests
    },
    
    // Agent 系统测试
    {
        name: '上下文管理器单元测试',
        category: 'agent',
        run: runContextManagerTests
    },
    {
        name: 'Agent 系统集成测试',
        category: 'integration',
        run: runAgentSystemIntegrationTests
    }
];

async function runAllTests() {
    console.log('🧪 BCoder 测试套件');
    console.log('=' .repeat(60));
    console.log(`📋 总共 ${testSuites.length} 个测试套件\n`);
    
    // 设置模拟环境
    setupMockEnvironment();
    
    const results = {
        total: 0,
        passed: 0,
        failed: 0,
        suites: [] as Array<{ name: string; category: string; passed: number; failed: number; success: boolean }>
    };
    
    try {
        for (const suite of testSuites) {
            console.log(`\n🔍 运行: ${suite.name}`);
            console.log('-' .repeat(40));
            
            try {
                const result = await suite.run();
                
                results.total++;
                results.passed += result.passed;
                results.failed += result.failed;
                
                const success = result.failed === 0;
                results.suites.push({
                    name: suite.name,
                    category: suite.category,
                    passed: result.passed,
                    failed: result.failed,
                    success
                });
                
                const status = success ? '✅ 通过' : '❌ 失败';
                console.log(`${status} - ${result.passed} 通过, ${result.failed} 失败`);
                
            } catch (error) {
                console.error(`❌ 测试套件执行失败: ${error}`);
                results.total++;
                results.failed++;
                results.suites.push({
                    name: suite.name,
                    category: suite.category,
                    passed: 0,
                    failed: 1,
                    success: false
                });
            }
        }
        
        // 显示总结
        console.log('\n' + '=' .repeat(60));
        console.log('📊 测试结果总结');
        console.log('=' .repeat(60));
        
        // 按类别分组显示
        const categories = ['tools', 'agent', 'integration'] as const;
        
        categories.forEach(category => {
            const categoryTests = results.suites.filter(s => s.category === category);
            if (categoryTests.length > 0) {
                const categoryName = {
                    tools: '🛠️ 工具系统',
                    agent: '🤖 Agent 系统',
                    integration: '🔗 集成测试'
                }[category];
                
                console.log(`\n${categoryName}:`);
                categoryTests.forEach(test => {
                    const status = test.success ? '✅' : '❌';
                    console.log(`  ${status} ${test.name}: ${test.passed} 通过, ${test.failed} 失败`);
                });
            }
        });
        
        // 总体统计
        const successfulSuites = results.suites.filter(s => s.success).length;
        const failedSuites = results.suites.length - successfulSuites;
        
        console.log('\n📈 总体统计:');
        console.log(`  测试套件: ${successfulSuites}/${results.suites.length} 通过`);
        console.log(`  测试用例: ${results.passed} 通过, ${results.failed} 失败`);
        console.log(`  成功率: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);
        
        // 最终状态
        const overallSuccess = failedSuites === 0;
        console.log('\n' + '=' .repeat(60));
        if (overallSuccess) {
            console.log('🎉 所有测试通过! BCoder 系统运行正常');
        } else {
            console.log('⚠️ 部分测试失败，请检查上述错误信息');
        }
        console.log('=' .repeat(60));
        
        return overallSuccess;
        
    } finally {
        teardownMockEnvironment();
    }
}

async function runTestsByCategory(category: 'tools' | 'agent' | 'integration' | 'all' = 'all') {
    console.log(`🧪 运行 ${category} 类别测试\n`);
    
    const filteredSuites = category === 'all' 
        ? testSuites 
        : testSuites.filter(suite => suite.category === category);
    
    if (filteredSuites.length === 0) {
        console.log(`❌ 没有找到 ${category} 类别的测试`);
        return false;
    }
    
    setupMockEnvironment();
    
    try {
        let totalPassed = 0;
        let totalFailed = 0;
        
        for (const suite of filteredSuites) {
            console.log(`\n🔍 ${suite.name}`);
            console.log('-' .repeat(30));
            
            const result = await suite.run();
            totalPassed += result.passed;
            totalFailed += result.failed;
        }
        
        console.log(`\n📊 ${category} 测试完成:`);
        console.log(`  通过: ${totalPassed}`);
        console.log(`  失败: ${totalFailed}`);
        
        return totalFailed === 0;
        
    } finally {
        teardownMockEnvironment();
    }
}

async function runDemo() {
    console.log('🎬 运行 BCoder 工具系统演示\n');
    
    try {
        await runToolDemo();
        console.log('\n✅ 演示完成');
        return true;
    } catch (error) {
        console.error('\n❌ 演示失败:', error);
        return false;
    }
}

// 命令行接口
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'all';
    
    switch (command) {
        case 'tools':
            const toolsSuccess = await runTestsByCategory('tools');
            process.exit(toolsSuccess ? 0 : 1);
            break;
            
        case 'agent':
            const agentSuccess = await runTestsByCategory('agent');
            process.exit(agentSuccess ? 0 : 1);
            break;
            
        case 'integration':
            const integrationSuccess = await runTestsByCategory('integration');
            process.exit(integrationSuccess ? 0 : 1);
            break;
            
        case 'demo':
            const demoSuccess = await runDemo();
            process.exit(demoSuccess ? 0 : 1);
            break;
            
        case 'all':
        default:
            const allSuccess = await runAllTests();
            process.exit(allSuccess ? 0 : 1);
            break;
    }
}

// 导出函数供其他模块使用
export { runAllTests, runTestsByCategory, runDemo };

// 如果直接运行此文件
if (require.main === module) {
    main().catch(error => {
        console.error('测试运行失败:', error);
        process.exit(1);
    });
}
