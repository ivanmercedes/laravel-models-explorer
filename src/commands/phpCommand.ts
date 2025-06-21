import { BaseCommand, Command, defaultOptions } from "./baseCommand";
import { get_models } from "virtual:php-scripts";
import path from "path";
import { ModelInfo } from "../laravelModelsProvider";
import { window } from 'vscode';


export type CommandModelInfo = ModelInfo & {
    uri: string
};

export class PHPCommand extends BaseCommand {

    protected static async PHPIsInstalled(): Promise<boolean> {
        try {
            await this.execCommand({ program: 'php --help' } as Command);
        } catch (error) {
            return false;
        }
        return true;
    }

    public static async getModels(workspaceFolder: string): Promise<CommandModelInfo[]> {
        if (!workspaceFolder.length) {
            return Promise.resolve([]);
        }

        if (!this.PHPIsInstalled()) {
            window.showErrorMessage("Missing PHP Binaries. Install PHP or re-open VS Code.");
            return Promise.resolve([]);
        }

        const command: Command = {
            program: 'php',
            args: [
                get_models,
                path.normalize(workspaceFolder),
            ]
        };

        return this.execCommand(command, { ...defaultOptions, outputAsJSEntity: true });
    }
}