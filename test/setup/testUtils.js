"use strict";
/**
 * 测试工具函数
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
exports.TestRunner = exports.TestAssert = exports.sleep = exports.createTestProject = exports.createTestFile = exports.cleanupTempDir = exports.createTempTestDir = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
/**
 * 创建临时测试目录
 */
function createTempTestDir(prefix = 'bcoder-test') {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    console.log(`Created temp test directory: ${tempDir}`);
    return tempDir;
}
exports.createTempTestDir = createTempTestDir;
/**
 * 清理临时测试目录
 */
function cleanupTempDir(dirPath) {
    if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
        console.log(`Cleaned up temp directory: ${dirPath}`);
    }
}
exports.cleanupTempDir = cleanupTempDir;
/**
 * 创建测试文件
 */
function createTestFile(dirPath, fileName, content) {
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
exports.createTestFile = createTestFile;
/**
 * 创建测试项目结构
 */
function createTestProject(baseDir) {
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
exports.createTestProject = createTestProject;
/**
 * 等待指定时间
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
exports.sleep = sleep;
/**
 * 测试结果断言工具
 */
class TestAssert {
    static isTrue(condition, message) {
        if (!condition) {
            throw new Error(message || 'Assertion failed: expected true');
        }
    }
    static isFalse(condition, message) {
        if (condition) {
            throw new Error(message || 'Assertion failed: expected false');
        }
    }
    static equals(actual, expected, message) {
        if (actual !== expected) {
            throw new Error(message || `Assertion failed: expected ${expected}, got ${actual}`);
        }
    }
    static notEquals(actual, expected, message) {
        if (actual === expected) {
            throw new Error(message || `Assertion failed: expected not ${expected}, got ${actual}`);
        }
    }
    static contains(text, substring, message) {
        if (!text.includes(substring)) {
            throw new Error(message || `Assertion failed: "${text}" does not contain "${substring}"`);
        }
    }
    static notContains(text, substring, message) {
        if (text.includes(substring)) {
            throw new Error(message || `Assertion failed: "${text}" contains "${substring}"`);
        }
    }
    static isArray(value, message) {
        if (!Array.isArray(value)) {
            throw new Error(message || 'Assertion failed: expected array');
        }
    }
    static hasLength(array, expectedLength, message) {
        if (array.length !== expectedLength) {
            throw new Error(message || `Assertion failed: expected length ${expectedLength}, got ${array.length}`);
        }
    }
    static throws(fn, message) {
        try {
            fn();
            throw new Error(message || 'Assertion failed: expected function to throw');
        }
        catch (error) {
            // Expected to throw
        }
    }
    static async throwsAsync(fn, message) {
        try {
            await fn();
            throw new Error(message || 'Assertion failed: expected async function to throw');
        }
        catch (error) {
            // Expected to throw
        }
    }
}
exports.TestAssert = TestAssert;
/**
 * 测试运行器
 */
class TestRunner {
    constructor() {
        this.tests = [];
    }
    test(name, fn) {
        this.tests.push({ name, fn });
    }
    beforeEach(fn) {
        this.beforeEachFn = fn;
    }
    afterEach(fn) {
        this.afterEachFn = fn;
    }
    async run() {
        const results = [];
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
            }
            catch (error) {
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
exports.TestRunner = TestRunner;
//# sourceMappingURL=testUtils.js.map