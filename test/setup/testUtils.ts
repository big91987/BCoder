/**
 * 测试工具函数
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * 创建临时测试目录
 */
export function createTempTestDir(prefix: string = 'bcoder-test'): string {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    console.log(`Created temp test directory: ${tempDir}`);
    return tempDir;
}

/**
 * 清理临时测试目录
 */
export function cleanupTempDir(dirPath: string): void {
    if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
        console.log(`Cleaned up temp directory: ${dirPath}`);
    }
}

/**
 * 创建测试文件
 */
export function createTestFile(dirPath: string, fileName: string, content: string): string {
    const filePath = path.join(dirPath, fileName);
    const fileDir = path.dirname(filePath);

    if (!fileDir.startsWith(dirPath)) {
        throw new Error('Invalid file path: outside test directory');
    }

    if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
}

/**
 * 创建测试项目结构
 */
export function createTestProject(baseDir: string): {
    projectRoot: string;
    files: Record<string, string>;
} {
    const projectRoot = path.join(baseDir, 'test-project');
    fs.mkdirSync(projectRoot, { recursive: true });

    const files = {
        'package.json': JSON.stringify({
            name: 'test-project',
            version: '1.0.0',
            description: 'Test project for BCoder',
            main: 'index.js',
            scripts: {
                test: 'jest',
                build: 'tsc'
            },
            dependencies: {
                express: '^4.18.0',
                lodash: '^4.17.21'
            },
            devDependencies: {
                '@types/node': '^18.0.0',
                typescript: '^4.8.0',
                jest: '^29.0.0'
            }
        }, null, 2),

        'tsconfig.json': JSON.stringify({
            compilerOptions: {
                target: 'ES2020',
                module: 'commonjs',
                outDir: './dist',
                rootDir: './src',
                strict: true,
                esModuleInterop: true
            },
            include: ['src/**/*'],
            exclude: ['node_modules', 'dist']
        }, null, 2),

        'src/index.ts': `import express from 'express';
import { greet } from './utils/greeting';

const app = express();
const port = 3000;

app.get('/', (req, res) => {
    res.send(greet('World'));
});

app.listen(port, () => {
    console.log(\`Server running at http://localhost:\${port}\`);
});`,

        'src/utils/greeting.ts': `export function greet(name: string): string {
    return \`Hello, \${name}!\`;
}

export function farewell(name: string): string {
    return \`Goodbye, \${name}!\`;
}`,

        'src/models/User.ts': `export interface User {
    id: number;
    name: string;
    email: string;
    createdAt: Date;
}

export class UserService {
    private users: User[] = [];

    addUser(user: Omit<User, 'id' | 'createdAt'>): User {
        const newUser: User = {
            ...user,
            id: this.users.length + 1,
            createdAt: new Date()
        };
        this.users.push(newUser);
        return newUser;
    }

    getUser(id: number): User | undefined {
        return this.users.find(user => user.id === id);
    }

    getAllUsers(): User[] {
        return [...this.users];
    }
}`,

        'README.md': `# Test Project

This is a test project for BCoder testing.

## Features

- Express.js server
- TypeScript support
- User management
- Greeting utilities

## Usage

\`\`\`bash
npm install
npm run build
npm start
\`\`\``,

        '.gitignore': `node_modules/
dist/
*.log
.env
.DS_Store`,

        'test/greeting.test.ts': `import { greet, farewell } from '../src/utils/greeting';

describe('Greeting Utils', () => {
    test('greet should return hello message', () => {
        expect(greet('Alice')).toBe('Hello, Alice!');
    });

    test('farewell should return goodbye message', () => {
        expect(farewell('Bob')).toBe('Goodbye, Bob!');
    });
});`
    };

    // 创建所有文件
    Object.entries(files).forEach(([filePath, content]) => {
        createTestFile(projectRoot, filePath, content);
    });

    return { projectRoot, files };
}

/**
 * 等待指定时间
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 测试结果断言工具
 */
export class TestAssert {
    static isTrue(condition: boolean, message?: string): void {
        if (!condition) {
            throw new Error(message || 'Assertion failed: expected true');
        }
    }

    static isFalse(condition: boolean, message?: string): void {
        if (condition) {
            throw new Error(message || 'Assertion failed: expected false');
        }
    }

    static equals<T>(actual: T, expected: T, message?: string): void {
        if (actual !== expected) {
            throw new Error(message || `Assertion failed: expected ${expected}, got ${actual}`);
        }
    }

    static notEquals<T>(actual: T, expected: T, message?: string): void {
        if (actual === expected) {
            throw new Error(message || `Assertion failed: expected not ${expected}, got ${actual}`);
        }
    }

    static contains(text: string, substring: string, message?: string): void {
        if (!text.includes(substring)) {
            throw new Error(message || `Assertion failed: "${text}" does not contain "${substring}"`);
        }
    }

    static notContains(text: string, substring: string, message?: string): void {
        if (text.includes(substring)) {
            throw new Error(message || `Assertion failed: "${text}" contains "${substring}"`);
        }
    }

    static isArray(value: any, message?: string): void {
        if (!Array.isArray(value)) {
            throw new Error(message || 'Assertion failed: expected array');
        }
    }

    static hasLength(array: any[], expectedLength: number, message?: string): void {
        if (array.length !== expectedLength) {
            throw new Error(message || `Assertion failed: expected length ${expectedLength}, got ${array.length}`);
        }
    }

    static throws(fn: () => void, message?: string): void {
        try {
            fn();
            throw new Error(message || 'Assertion failed: expected function to throw');
        } catch (error) {
            // Expected to throw
        }
    }

    static async throwsAsync(fn: () => Promise<void>, message?: string): Promise<void> {
        try {
            await fn();
            throw new Error(message || 'Assertion failed: expected async function to throw');
        } catch (error) {
            // Expected to throw
        }
    }
}

/**
 * 测试运行器
 */
export class TestRunner {
    private tests: Array<{ name: string; fn: () => Promise<void> | void }> = [];
    private beforeEachFn?: () => Promise<void> | void;
    private afterEachFn?: () => Promise<void> | void;

    test(name: string, fn: () => Promise<void> | void): void {
        this.tests.push({ name, fn });
    }

    beforeEach(fn: () => Promise<void> | void): void {
        this.beforeEachFn = fn;
    }

    afterEach(fn: () => Promise<void> | void): void {
        this.afterEachFn = fn;
    }

    async run(): Promise<{ passed: number; failed: number; results: Array<{ name: string; success: boolean; error?: string }> }> {
        const results: Array<{ name: string; success: boolean; error?: string }> = [];
        let passed = 0;
        let failed = 0;

        console.log(`\n🧪 Running ${this.tests.length} tests...\n`);

        for (const test of this.tests) {
            try {
                if (this.beforeEachFn) {
                    await this.beforeEachFn();
                }

                await test.fn();

                if (this.afterEachFn) {
                    await this.afterEachFn();
                }

                console.log(`✅ ${test.name}`);
                results.push({ name: test.name, success: true });
                passed++;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.log(`❌ ${test.name}: ${errorMessage}`);
                results.push({ name: test.name, success: false, error: errorMessage });
                failed++;
            }
        }

        console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed\n`);

        return { passed, failed, results };
    }
}
