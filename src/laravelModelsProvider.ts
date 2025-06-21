import * as vscode from 'vscode';
import { CommandModelInfo, PHPCommand } from './commands/phpCommand';
import { isCommandError } from './commands/baseCommand';

export interface ModelInfo {
    name: string;
    namespace: string;
    table: string;
    fillable: string[];
    hidden: string[];
    casts: { [key: string]: string };
    relationships: RelationshipInfo[];
    traits: string[];
}

export interface RelationshipInfo {
    name: string;
    type: string;
    relatedModel?: string;
}

export class LaravelModelsProvider implements vscode.TreeDataProvider<ModelItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ModelItem | undefined | null | void> = new vscode.EventEmitter<ModelItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ModelItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private items: ModelItem[] = [];
    private label: string | undefined;

    constructor() {
        this.refresh();
    }

    async refresh(): Promise<void> {
        this.items = [];
        await this.loadItems();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ModelItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ModelItem): Thenable<ModelItem[]> {
        if (!element) {
            return Promise.resolve(this.items);
        }
        return Promise.resolve(element.children || []);
    }

    private async loadItems() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            this.items = [];
            return;
        }

        this.items = [];
        const config = vscode.workspace.getConfiguration('laravelModelsExplorer');

        // Add Project Info
        if (config.get('showProjectInfo', true)) {
            const projectInfo = await this.getProjectInfo(workspaceFolder);
            if (projectInfo) {
                this.items.push(projectInfo);
            }
        }

        // Load Models
        try {
            const models = await PHPCommand.getModels(workspaceFolder.uri.fsPath);

            models.forEach((model: CommandModelInfo) => {
                const { uri, ...modelInfo }: CommandModelInfo = model;
                const file = vscode.Uri.file(uri);

                const modelItem = new ModelItem(
                    modelInfo.name,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    file
                );

                // load information as nodes
                modelItem.children = this.createModelInfoNodes(modelInfo);
                modelItem.tooltip = this.createTooltip(modelInfo);

                this.items.push(modelItem);
            });

            this.items.sort((a, b) => a.label!.toString().localeCompare(b.label!.toString()));

        } catch (error) {
            console.error('Error loading models:', error);

            if (isCommandError(error)) {
                if ('status' in error) {
                    console.log(error.output.toString());
                }
            }

            this.items = [];
        }
    }

    private async getProjectInfo(workspaceFolder: vscode.WorkspaceFolder): Promise<ModelItem | null> {
        try {
            // Obtener versión de Laravel del composer.json
            const composerJsonPath = vscode.Uri.joinPath(workspaceFolder.uri, 'composer.json');
            let laravelVersion = 'N/A';
            let modelCount = 0;

            try {
                const composerJsonContent = await vscode.workspace.fs.readFile(composerJsonPath);
                const composerJson = JSON.parse(Buffer.from(composerJsonContent).toString());
                laravelVersion = composerJson.require?.['laravel/framework'] || composerJson.require?.['laravel/lumen-framework'] || 'N/A';
            } catch (e) {
                console.warn("Could not read or parse composer.json for Laravel version.");
            }

            // Contar modelos
            try {
                const modelsPattern = new vscode.RelativePattern(workspaceFolder, 'app/Models/**/*.php');
                const modelFiles = await vscode.workspace.findFiles(modelsPattern);
                modelCount = modelFiles.length;
            } catch (e) {
                console.warn("Could not count model files.");
            }


            const projectInfoNode = new ModelItem(
                'Project Information',
                vscode.TreeItemCollapsibleState.Expanded, // Expandido por defecto
                undefined,
                'projectInfo'
            );
            projectInfoNode.tooltip = this.createTooltip({}, 'projectInfo'); // Set tooltip for project info
            projectInfoNode.iconPath = new vscode.ThemeIcon('info');

            const versionNode = new ModelItem(`Laravel Version: ${laravelVersion.replace('^', '')}`, vscode.TreeItemCollapsibleState.None, undefined, 'projectInfoDetail');
            versionNode.tooltip = this.createTooltip({ name: `Laravel Version: ${laravelVersion.replace('^', '')}` }, 'projectInfoDetail');

            const countNode = new ModelItem(`Models Found: ${modelCount}`, vscode.TreeItemCollapsibleState.None, undefined, 'projectInfoDetail');
            countNode.tooltip = this.createTooltip({ name: `Models Found: ${modelCount}` }, 'projectInfoDetail');

            projectInfoNode.children = [versionNode, countNode];
            return projectInfoNode;

        } catch (error) {
            console.error('Error getting project info:', error);
            return null;
        }
    }

    private createModelInfoNodes(modelInfo: any, expandSubItems: boolean = false): ModelItem[] {
        const children: ModelItem[] = [];
        const subItemCollapsibleState = expandSubItems ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;

        // Propiedades fillable
        if (modelInfo.fillable && modelInfo.fillable.length > 0) {
            const fillableNode = new ModelItem(
                `Fillable (${modelInfo.fillable.length})`,
                subItemCollapsibleState,
                undefined,
                'modelDetail'
            );
            fillableNode.iconPath = new vscode.ThemeIcon('edit');
            fillableNode.children = modelInfo.fillable.map((field: string) =>
                new ModelItem(field, vscode.TreeItemCollapsibleState.None, undefined, 'modelDetailItem')
            );
            children.push(fillableNode);
        }

        // Propiedades hidden
        if (modelInfo.hidden && modelInfo.hidden.length > 0) {
            const hiddenNode = new ModelItem(
                `Hidden (${modelInfo.hidden.length})`,
                subItemCollapsibleState,
                undefined,
                'modelDetail'
            );
            hiddenNode.iconPath = new vscode.ThemeIcon('eye-closed');
            hiddenNode.children = modelInfo.hidden.map((field: string) =>
                new ModelItem(field, vscode.TreeItemCollapsibleState.None, undefined, 'modelDetailItem')
            );
            children.push(hiddenNode);
        }

        // Casts
        if (modelInfo.casts && Object.keys(modelInfo.casts).length > 0) {
            const castsNode = new ModelItem(
                `Casts (${Object.keys(modelInfo.casts).length})`,
                subItemCollapsibleState,
                undefined,
                'modelDetail'
            );
            castsNode.iconPath = new vscode.ThemeIcon('symbol-property');
            castsNode.children = Object.entries(modelInfo.casts).map(([field, type]) =>
                new ModelItem(`${field}: ${type}`, vscode.TreeItemCollapsibleState.None, undefined, 'modelDetailItem')
            );
            children.push(castsNode);
        }

        // Relaciones
        if (modelInfo.relationships && modelInfo.relationships.length > 0) {
            const relationshipsNode = new ModelItem(
                `Relationships (${modelInfo.relationships.length})`,
                subItemCollapsibleState,
                undefined,
                'modelDetail'
            );
            relationshipsNode.iconPath = new vscode.ThemeIcon('references');
            relationshipsNode.children = modelInfo.relationships.map((rel: any) =>
                new ModelItem(`${rel.name} (${rel.type})`, vscode.TreeItemCollapsibleState.None, undefined, 'modelDetailItem')
            );
            children.push(relationshipsNode);
        }

        // Tabla
        if (modelInfo.table) {
            const tableNode = new ModelItem(
                `Table: ${modelInfo.table}`,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                'modelDetail'
            );
            tableNode.iconPath = new vscode.ThemeIcon('database');
            children.push(tableNode);
        }

        return children;
    }

    private createTooltip(modelInfo: any, itemType: ModelItem['itemType'] = 'model'): vscode.MarkdownString | string {
        const config = vscode.workspace.getConfiguration('laravelModelsExplorer');
        const enableTooltips = config.get('enableTooltips', true);

        if (!enableTooltips) {
            if (itemType === 'model' && modelInfo.name && modelInfo.filePath) {
                return `${modelInfo.name} - ${modelInfo.filePath}`;
            }
            return this.label?.toString() || '';
        }

        if (itemType === 'projectInfo') {
            const projectTooltip = new vscode.MarkdownString();
            projectTooltip.appendMarkdown("**Project Information**\n");
            projectTooltip.appendMarkdown("Details about your Laravel project.");
            projectTooltip.isTrusted = true;
            return projectTooltip;
        }

        if (itemType === 'projectInfoDetail' && typeof this.label === 'string') {
            return this.label; // Simple text tooltip for project details
        }

        // Tooltip for Models and their details
        if (modelInfo && modelInfo.name) {
            const tooltip = new vscode.MarkdownString("", true); // enablemarkdown
            tooltip.supportHtml = true;
            tooltip.isTrusted = true;
            tooltip.appendMarkdown(`#### ${modelInfo.name}\n`);
            if (modelInfo.filePath) {
                tooltip.appendMarkdown(`*${modelInfo.filePath}*\n\n---\n\n`);
            }
            if (modelInfo.table) {
                tooltip.appendMarkdown(`**Table:** \`${modelInfo.table}\`\n\n`);
            }
            if (modelInfo.fillable && modelInfo.fillable.length > 0) {
                tooltip.appendMarkdown(`**Fillable (${modelInfo.fillable.length}):**\n`);
                modelInfo.fillable.forEach((f: string) => tooltip.appendMarkdown(`- \`${f}\`\n`));
                tooltip.appendMarkdown('\n');
            }
            if (modelInfo.hidden && modelInfo.hidden.length > 0) {
                tooltip.appendMarkdown(`**Hidden (${modelInfo.hidden.length}):**\n`);
                modelInfo.hidden.forEach((h: string) => tooltip.appendMarkdown(`- \`${h}\`\n`));
                tooltip.appendMarkdown('\n');
            }
            if (modelInfo.casts && Object.keys(modelInfo.casts).length > 0) {
                tooltip.appendMarkdown(`**Casts (${Object.keys(modelInfo.casts).length}):**\n`);
                Object.entries(modelInfo.casts).forEach(([key, value]) => tooltip.appendMarkdown(`- \`${key}\` => \`${value}\`\n`));
                tooltip.appendMarkdown('\n');
            }
            if (modelInfo.relationships && modelInfo.relationships.length > 0) {
                tooltip.appendMarkdown(`**Relationships (${modelInfo.relationships.length}):**\n`);
                modelInfo.relationships.forEach((r: { name: string, type: string }) => tooltip.appendMarkdown(`- \`${r.name}()\` (${r.type})\n`));
                tooltip.appendMarkdown('\n');
            }
            return tooltip;
        }

        return modelInfo?.name || this.label?.toString() || '';
    }
}

export class ModelItem extends vscode.TreeItem {
    children: ModelItem[] | undefined;
    public originalLabel: string; // Store the original label for cases where tooltip might be simpler

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly resourceUri?: vscode.Uri,
        public readonly itemType: 'model' | 'modelDetail' | 'modelDetailItem' | 'projectInfo' | 'projectInfoDetail' | 'loading' = 'model',
        public modelInfo?: any // Store modelInfo for tooltip generation
    ) {
        super(label, collapsibleState);
        this.originalLabel = label;
        this.contextValue = itemType;

        // Assign tooltip directly here, it will be generated by the provider before this constructor for models
        // For other types, we can set a default or have the provider set it.
        if (itemType === 'model' && resourceUri) {
            this.command = {
                command: 'laravelModels.openModel',
                title: 'Open Model',
                arguments: [this]
            };
            this.iconPath = new vscode.ThemeIcon('symbol-class');
            // Tooltip is set in provider
        } else if (itemType === 'projectInfoDetail') {
            this.iconPath = new vscode.ThemeIcon('circle-small-filled');
            this.tooltip = label; // Simple label tooltip for these items
        } else if (itemType === 'projectInfo') {
            this.tooltip = "Project Information"; // Simple label tooltip for these items
        }
        // For modelDetail and modelDetailItem, tooltips might not be necessary or can be the label itself
        else if (itemType === 'modelDetail' || itemType === 'modelDetailItem') {
            this.tooltip = label;
        }
    }
}