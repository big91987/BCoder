/**
 * 简化的测试运行器 - 独立运行，不依赖 VSCode
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// 简单的测试框架
class SimpleTest {
    private tests: Array<{ name: string; fn: () => Promise<void> | void }> = [];
    private passed = 0;
    private failed = 0;

    test(name: string, fn: () => Promise<void> | void) {
        this.tests.push({ name, fn });
    }

    async run() {
        console.log(`🧪 运行 ${this.tests.length} 个测试...\n`);

        for (const test of this.tests) {
            try {
                await test.fn();
                console.log(`✅ ${test.name}`);
                this.passed++;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.log(`❌ ${test.name}: ${errorMessage}`);
                this.failed++;
            }
        }

        console.log(`\n📊 结果: ${this.passed} 通过, ${this.failed} 失败`);
        return { passed: this.passed, failed: this.failed };
    }
}

// 简单的断言
class Assert {
    static isTrue(condition: boolean, message?: string) {
        if (!condition) {
            throw new Error(message || 'Expected true');
        }
    }

    static equals<T>(actual: T, expected: T, message?: string) {
        if (actual !== expected) {
            throw new Error(message || `Expected ${expected}, got ${actual}`);
        }
    }

    static contains(text: string, substring: string, message?: string) {
        if (!text.includes(substring)) {
            throw new Error(message || `"${text}" does not contain "${substring}"`);
        }
    }

    static isArray(value: any, message?: string) {
        if (!Array.isArray(value)) {
            throw new Error(message || 'Expected array');
        }
    }
}

// 工具函数
function createTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'bcoder-test-'));
}

function cleanupDir(dirPath: string) {
    if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
    }
}

function createTestFile(dir: string, fileName: string, content: string): string {
    const filePath = path.join(dir, fileName);
    const fileDir = path.dirname(filePath);

    if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
}

// 模拟安全管理器（简化版）
class MockSecurityManager {
    constructor(private workspaceRoot: string) {}

    validatePath(filePath: string): { granted: boolean; reason?: string } {
        const absolutePath = path.resolve(filePath);

        if (!absolutePath.startsWith(this.workspaceRoot)) {
            return { granted: false, reason: 'Path is outside workspace' };
        }

        if (absolutePath.includes('..')) {
            return { granted: false, reason: 'Path traversal detected' };
        }

        return { granted: true };
    }

    async validateFileRead(filePath: string): Promise<{ granted: boolean; reason?: string }> {
        const pathResult = this.validatePath(filePath);
        if (!pathResult.granted) {
            return pathResult;
        }

        if (!fs.existsSync(filePath)) {
            return { granted: false, reason: 'File does not exist' };
        }

        const stats = fs.statSync(filePath);
        if (!stats.isFile()) {
            return { granted: false, reason: 'Path is not a file' };
        }

        return { granted: true };
    }

    async validateFileWrite(filePath: string): Promise<{ granted: boolean; reason?: string }> {
        const pathResult = this.validatePath(filePath);
        if (!pathResult.granted) {
            return pathResult;
        }

        const directory = path.dirname(filePath);
        if (!fs.existsSync(directory)) {
            return { granted: false, reason: 'Parent directory does not exist' };
        }

        return { granted: true };
    }
}

// 模拟文件工具（简化版）
class MockReadFileTool {
    constructor(private securityManager: MockSecurityManager) {}

    async execute(args: { path: string }): Promise<{ success: boolean; data?: any; error?: string }> {
        try {
            const permission = await this.securityManager.validateFileRead(args.path);
            if (!permission.granted) {
                return { success: false, error: `Permission denied: ${permission.reason}` };
            }

            const content = fs.readFileSync(args.path, 'utf-8');
            return {
                success: true,
                data: {
                    path: args.path,
                    content: content,
                    size: content.length
                }
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return { success: false, error: errorMessage };
        }
    }
}

class MockWriteFileTool {
    constructor(private securityManager: MockSecurityManager) {}

    async execute(args: { path: string; content: string }): Promise<{ success: boolean; data?: any; error?: string }> {
        try {
            const permission = await this.securityManager.validateFileWrite(args.path);
            if (!permission.granted) {
                return { success: false, error: `Permission denied: ${permission.reason}` };
            }

            const directory = path.dirname(args.path);
            if (!fs.existsSync(directory)) {
                fs.mkdirSync(directory, { recursive: true });
            }

            fs.writeFileSync(args.path, args.content, 'utf-8');
            return {
                success: true,
                data: {
                    path: args.path,
                    size: args.content.length
                }
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return { success: false, error: errorMessage };
        }
    }
}

// 主测试函数
async function runSimpleTests() {
    console.log('🚀 BCoder 简化测试开始\n');

    const test = new SimpleTest();
    let tempDir: string = '';
    let securityManager: MockSecurityManager;

    // 测试安全管理器
    test.test('安全管理器 - 有效路径', () => {
        tempDir = createTempDir();
        securityManager = new MockSecurityManager(tempDir);

        const validPath = path.join(tempDir, 'test.txt');
        const result = securityManager.validatePath(validPath);

        Assert.isTrue(result.granted, 'Should grant access to valid path');
    });

    test.test('安全管理器 - 无效路径', () => {
        const invalidPath = '/etc/passwd';
        const result = securityManager.validatePath(invalidPath);

        Assert.isTrue(!result.granted, 'Should deny access to invalid path');
        Assert.contains(result.reason!, 'outside workspace', 'Should indicate outside workspace');
    });

    // 测试文件工具
    test.test('文件读取工具 - 成功读取', async () => {
        const testContent = 'Hello, World!';
        const testFile = createTestFile(tempDir, 'test.txt', testContent);

        const readTool = new MockReadFileTool(securityManager);
        const result = await readTool.execute({ path: testFile });

        Assert.isTrue(result.success, 'Should succeed');
        Assert.equals(result.data.content, testContent, 'Content should match');
    });

    test.test('文件写入工具 - 成功写入', async () => {
        const testContent = 'New file content';
        const testFile = path.join(tempDir, 'new-file.txt');

        const writeTool = new MockWriteFileTool(securityManager);
        const result = await writeTool.execute({ path: testFile, content: testContent });

        Assert.isTrue(result.success, 'Should succeed');
        Assert.equals(result.data.size, testContent.length, 'Size should match');

        // 验证文件确实被创建
        Assert.isTrue(fs.existsSync(testFile), 'File should exist');
        const actualContent = fs.readFileSync(testFile, 'utf-8');
        Assert.equals(actualContent, testContent, 'File content should match');
    });

    test.test('工具集成 - 读写流程', async () => {
        const originalContent = 'Original content';
        const newContent = 'Modified content';
        const testFile = path.join(tempDir, 'integration-test.txt');

        const writeTool = new MockWriteFileTool(securityManager);
        const readTool = new MockReadFileTool(securityManager);

        // 写入文件
        const writeResult = await writeTool.execute({ path: testFile, content: originalContent });
        Assert.isTrue(writeResult.success, 'Write should succeed');

        // 读取文件
        const readResult = await readTool.execute({ path: testFile });
        Assert.isTrue(readResult.success, 'Read should succeed');
        Assert.equals(readResult.data.content, originalContent, 'Content should match');

        // 修改文件
        const modifyResult = await writeTool.execute({ path: testFile, content: newContent });
        Assert.isTrue(modifyResult.success, 'Modify should succeed');

        // 再次读取验证
        const verifyResult = await readTool.execute({ path: testFile });
        Assert.isTrue(verifyResult.success, 'Verify read should succeed');
        Assert.equals(verifyResult.data.content, newContent, 'Modified content should match');
    });

    // 运行测试
    const results = await test.run();

    // 清理
    if (tempDir) {
        cleanupDir(tempDir);
        console.log('\n🧹 清理完成');
    }

    console.log('\n🎉 简化测试完成!');
    return results.failed === 0;
}

// 如果直接运行此文件
if (require.main === module) {
    runSimpleTests()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('测试失败:', error);
            process.exit(1);
        });
}

export { runSimpleTests };
