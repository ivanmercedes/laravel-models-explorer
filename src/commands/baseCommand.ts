import { spawnSync, SpawnSyncReturns } from 'child_process';

export type CommandError = SpawnSyncReturns<Buffer> | Error;

export type Command = {
    program: string,
    args: string | string[] | undefined,
}

export const isCommand = (obj: any): obj is Command => {
    return typeof obj === 'object' && 'command' in obj;
};

export const isCommandError = (obj: any): obj is CommandError => {
    return obj !== null && typeof obj === 'object' && ('status' in obj || 'message' in obj);
};

export type CommandOptions = {
    outputAsJSEntity: boolean,
    directory: string,
}

export const defaultOptions: CommandOptions = { outputAsJSEntity: false, directory: '' };

export class BaseCommand {
    public static execCommand(command: Command, options: CommandOptions = defaultOptions): Promise<any> {
        return new this().execCommand(command, options);
    }

    protected parseArgs(args: Command['args']): string[] {
        switch (typeof args) {
            case "string":
                return ['', args as string];
            case "undefined":
                return [];
            default:
                return (args as string[]);
        }
    }

    protected execCommand({ program, args }: Command, options: CommandOptions): Promise<any> {
        return new Promise(
            (resolve, reject) => {
                if (options.directory.length !== 0) {
                    program = `cd ${options.directory} && ${program}`;
                }

                args = this.parseArgs(args);

                const command: string = [program, ...args].join(" ");

                const result: SpawnSyncReturns<Buffer> = spawnSync(command, { encoding: 'buffer', shell: true });
                result.output = result.output.filter((value) => (value?.length ?? 0) !== 0);
                const value = result.output.toString();
                result.status === 0
                    ? resolve(options.outputAsJSEntity ? JSON.parse(value) : value)
                    : reject(result);
            }
        );
    };
}