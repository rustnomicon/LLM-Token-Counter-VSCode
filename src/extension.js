const vscode = require('vscode');
const { encoding_for_model, get_encoding } = require('tiktoken');
const { countTokens } = require('@anthropic-ai/tokenizer');

let encoder = null;  // Initialize encoder as null

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    let statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.command = "gpt-token-counter-live.changeModel";

    // Model families instead of individual models
    const modelFamilies = {
        'openai': 'GPT',
        'anthropic': 'Claude',
        'gemini': 'Gemini'
    };

    // Special tokens handled per family (kept minimal)
    const specialTokensByFamily = {
        'openai': ['<|endoftext|>'],
        'anthropic': [],
        'gemini': []
    };

    let currentProvider = 'openai';
    let currentFamilyName = modelFamilies[currentProvider];

    context.subscriptions.push(statusBar);

    // Function to initialize the encoder for the selected family
    function initializeEncoderForFamily(provider) {
        if (encoder) {
            encoder.free();
        }
        // For OpenAI GPT family, prefer o200k_base (latest models),
        // and fall back to cl100k_base if unavailable.
        if (provider === 'openai') {
            try {
                // Use the latest GPT family mapping via tiktoken's model registry
                encoder = encoding_for_model('gpt-5');
            } catch (e0) {
                try {
                    encoder = get_encoding('o200k_base');
                } catch (e1) {
                    try {
                        encoder = get_encoding('cl100k_base');
                    } catch (e2) {
                        encoder = null;
                    }
                }
            }
        } else if (provider === 'gemini') {
            // Gemini has no public local tokenizer; approximate with o200k_base/cl100k_base
            try {
                encoder = get_encoding('o200k_base');
            } catch (e1) {
                try {
                    encoder = get_encoding('cl100k_base');
                } catch (e2) {
                    encoder = null; // will fall back to char-based approximation
                }
            }
        } else {
            // Anthropic doesn't use tiktoken; keep encoder null
            encoder = null;
        }
    }

    // Function to handle special tokens
    function handleSpecialTokens(text, provider) {
        const tokens = specialTokensByFamily[provider] || [];
        let specialTokenCount = 0;
        tokens.forEach(token => {
            const occurrences = text.split(token).length - 1;
            specialTokenCount += occurrences;
            text = text.split(token).join('');
        });
        return { text, specialTokenCount };
    }

    let updateTokenCount = () => {
        let editor = vscode.window.activeTextEditor;
        if (!editor) {
            statusBar.hide();
            return; // No open text editor
        }

        let document = editor.document;
        let selection = editor.selection;
        let text = selection.isEmpty ? document.getText() : document.getText(selection);

        // Handle special tokens before tokenizing
        const { text: processedText, specialTokenCount } = handleSpecialTokens(text, currentProvider);

        let tokenCount;
        if (currentProvider === 'anthropic') {
            tokenCount = countTokens(processedText) + specialTokenCount;
        } else if (currentProvider === 'gemini') {
            if (encoder) {
                // Approximate Gemini with available tiktoken encoder (o200k/cl100k)
                tokenCount = encoder.encode(processedText).length + specialTokenCount;
            } else {
                // Fallback approximation: ~4 characters per token
                const charCount = processedText.length;
                tokenCount = Math.ceil(charCount / 4) + specialTokenCount;
            }
        } else if (encoder) {
            tokenCount = encoder.encode(processedText).length + specialTokenCount;
        } else {
            tokenCount = specialTokenCount;
        }

        statusBar.text = `Token Count: ${tokenCount} (${currentFamilyName})`;
        statusBar.show();
    };

    vscode.window.onDidChangeTextEditorSelection(updateTokenCount, null, context.subscriptions);
    vscode.window.onDidChangeActiveTextEditor(updateTokenCount, null, context.subscriptions);
    vscode.workspace.onDidChangeTextDocument(updateTokenCount, null, context.subscriptions);

    let disposable = vscode.commands.registerCommand('gpt-token-counter-live.changeModel', async function () {
        const items = Object.entries(modelFamilies).map(([provider, family]) => `${provider}: ${family}`);
        let selection = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a Model Family',
        });

        if (selection) {
            const [provider, family] = selection.split(': ');
            currentProvider = provider;
            currentFamilyName = family;

            try {
                initializeEncoderForFamily(currentProvider);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to initialize tokenizer for ${currentFamilyName}: ${error.message}`);
                // Continue with approximation where applicable
            }

            updateTokenCount();
        }
    });

    context.subscriptions.push(disposable);

    // Initial update
    initializeEncoderForFamily(currentProvider);
    updateTokenCount();
}

function deactivate() {
    if (encoder) {
        encoder.free();
    }
}

module.exports = {
    activate,
    deactivate
}
