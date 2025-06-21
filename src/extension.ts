import * as vscode from 'vscode';
import { LaravelModelsProvider, ModelItem } from './laravelModelsProvider';
import { LaravelProjectDetector } from './laravelProjectDetector';
import ModelTemplate from './templates/model';

let modelsProvider: LaravelModelsProvider;

export function activate(context: vscode.ExtensionContext) {
    const detector = new LaravelProjectDetector();
    
    // Detectar si es un proyecto Laravel
    detector.isLaravelProject().then(isLaravel => {
        if (isLaravel) {
            vscode.commands.executeCommand('setContext', 'laravelProject', true);
            
            // Inicializar el proveedor de modelos
            modelsProvider = new LaravelModelsProvider();
            
            // Registrar el tree view
            const treeView = vscode.window.createTreeView('laravelModels', {
                treeDataProvider: modelsProvider,
                showCollapseAll: true
            });
            
            // Registrar comandos
            const refreshCommand = vscode.commands.registerCommand('laravelModels.refresh', async () => {
                await modelsProvider.refresh();
            });
            
            const openModelCommand = vscode.commands.registerCommand('laravelModels.openModel', (model: ModelItem) => {
                if (model.resourceUri) {
                    vscode.window.showTextDocument(model.resourceUri);
                }
            });
            
            const createModelCommand = vscode.commands.registerCommand('laravelModels.createModel', async () => {
                const modelName = await vscode.window.showInputBox({
                    prompt: 'Model name (e.g., User, Post, Category)',
                    validateInput: (value) => {
                        if (!value || value.trim() === '') {
                            return 'Model name cannot be empty';
                        }
                        if (!/^[A-Z][a-zA-Z0-9]*$/.test(value)) {
                            return 'Name must start with an uppercase letter and contain only letters and numbers';
                        }
                        return null;
                    }
                });
                
                if (modelName) {
                    await createNewModel(modelName);
                    await modelsProvider.refresh();
                }
            });
            
            // Auto-refresh cuando se modifican archivos
            const watcher = vscode.workspace.createFileSystemWatcher('**/app/Models/**/*.php');
            const autoRefreshHandler = async () => {
                const config = vscode.workspace.getConfiguration('laravelModelsExplorer');
                if (config.get('autoRefresh', true)) {
                    await modelsProvider.refresh();
                }
            };
            watcher.onDidCreate(autoRefreshHandler);
            watcher.onDidDelete(autoRefreshHandler);
            watcher.onDidChange(autoRefreshHandler);
            
            // Actualizar cuando cambia la configuración
            vscode.workspace.onDidChangeConfiguration(async e => {
                let needsRefresh = false;
                const config = vscode.workspace.getConfiguration('laravelModelsExplorer');

                if (e.affectsConfiguration('laravelModelsExplorer.autoRefresh') && config.get('autoRefresh', true)) {
                    needsRefresh = true;
                }
                if (e.affectsConfiguration('laravelModelsExplorer.showProjectInfo')) {
                    needsRefresh = true;
                }
                if (e.affectsConfiguration('laravelModelsExplorer.expandByDefault')) {
                    needsRefresh = true;
                }
                if (e.affectsConfiguration('laravelModelsExplorer.enableTooltips')) {
                    needsRefresh = true;
                }

                if (needsRefresh) {
                    await modelsProvider.refresh();
                }
            });
            
            context.subscriptions.push(
                treeView,
                refreshCommand,
                openModelCommand,
                createModelCommand,
                watcher
            );
        }
    });
}

async function createNewModel(modelName: string) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {return;}
    
    const modelsPath = vscode.Uri.joinPath(workspaceFolder.uri, 'app', 'Models');
    const modelFile = vscode.Uri.joinPath(modelsPath, `${modelName}.php`);
    
    try {
        await vscode.workspace.fs.writeFile(modelFile, Buffer.from(ModelTemplate(modelName)));
        await vscode.window.showTextDocument(modelFile);
        vscode.window.showInformationMessage(`Model ${modelName} created successfully`);
    } catch (error) {
        vscode.window.showErrorMessage(`Error creating the model: ${error}`);
    }
}

export function deactivate() {}