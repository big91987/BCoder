import * as assert from 'assert';
import * as vscode from 'vscode';
import { CompletionProvider } from '../../completionProvider';
import { ChatProvider } from '../../chatProvider';
import { AIClient } from '../../utils/aiClient';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('bcoder.bcoder'));
    });

    test('Extension should activate', async () => {
        const extension = vscode.extensions.getExtension('bcoder.bcoder');
        if (extension) {
            await extension.activate();
            assert.ok(extension.isActive);
        }
    });

    test('Commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        const bcoderCommands = commands.filter(cmd => cmd.startsWith('bcoder.'));

        assert.ok(bcoderCommands.includes('bcoder.askQuestion'));
        assert.ok(bcoderCommands.includes('bcoder.explainCode'));
        assert.ok(bcoderCommands.includes('bcoder.generateCode'));
        assert.ok(bcoderCommands.includes('bcoder.toggleCompletion'));
    });
});

suite('AIClient Test Suite', () => {
    let aiClient: AIClient;

    setup(() => {
        aiClient = new AIClient();
    });

    test('AIClient should initialize', () => {
        assert.ok(aiClient);
    });

    test('Local chat should work', async () => {
        const response = await aiClient.chat('Hello, how are you?');
        assert.ok(response);
        assert.ok(typeof response === 'string');
        assert.ok(response.length > 0);
    });

    test('Local completion should work', async () => {
        const response = await aiClient.complete('function test');
        assert.ok(response);
        assert.ok(typeof response === 'string');
        assert.ok(response.length > 0);
    });
});

suite('CompletionProvider Test Suite', () => {
    let completionProvider: CompletionProvider;
    let aiClient: AIClient;

    setup(() => {
        aiClient = new AIClient();
        completionProvider = new CompletionProvider(aiClient);
    });

    test('CompletionProvider should initialize', () => {
        assert.ok(completionProvider);
    });

    test('Should provide completions for JavaScript', async () => {
        // Create a mock document
        const document = await vscode.workspace.openTextDocument({
            content: 'function test() {\n    console.log("hello");\n}',
            language: 'javascript'
        });

        const position = new vscode.Position(1, 4);
        const completions = await completionProvider.provideCompletionItems(
            document,
            position,
            new vscode.CancellationTokenSource().token,
            { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: undefined }
        );

        assert.ok(Array.isArray(completions));
    });
});

suite('ChatProvider Test Suite', () => {
    let chatProvider: ChatProvider;
    let aiClient: AIClient;

    setup(() => {
        aiClient = new AIClient();
        chatProvider = new ChatProvider(aiClient);
    });

    test('ChatProvider should initialize', () => {
        assert.ok(chatProvider);
    });

    test('Should answer questions', async () => {
        const response = await chatProvider.askQuestion('What is a function?');
        assert.ok(response);
        assert.ok(typeof response === 'string');
        assert.ok(response.length > 0);
    });

    test('Should explain code', async () => {
        const code = 'function add(a, b) { return a + b; }';
        const explanation = await chatProvider.explainCode(code);
        assert.ok(explanation);
        assert.ok(typeof explanation === 'string');
        assert.ok(explanation.length > 0);
    });

    test('Should generate code', async () => {
        const prompt = 'Create a function that adds two numbers';
        const code = await chatProvider.generateCode(prompt, 'javascript');
        assert.ok(code);
        assert.ok(typeof code === 'string');
        assert.ok(code.length > 0);
    });

    test('Should clear history', () => {
        chatProvider.clearHistory();
        const history = chatProvider.getHistory();
        assert.strictEqual(history.length, 0);
    });
});
