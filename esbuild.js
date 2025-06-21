const esbuild = require("esbuild");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const path = require('path');
const fs = require('fs');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildPHPScriptLoaderPlugin = {
    name: "esbuild-php-script-loader",

    async setup(build) {
        const namespace = 'php-scripts';
        const virtualModuleId = 'virtual:' + namespace;
        const phpScriptsDirectory = path.resolve(__dirname, 'src/scripts');
        const dtsFile = path.resolve(__dirname, 'src/php.d.ts');

        const parsePropertyName = fileName => path.basename(fileName, '.php').replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

        try {
            const files = await fs.promises.readdir(phpScriptsDirectory);
            const scriptNames = files
                .filter(file => file.endsWith('.php'))
                .map(parsePropertyName);

            let dtsContent = `
                interface MyPHPScripts {
                    [key: string]: string;
                }

                declare module "virtual:php-scripts" {
                    const scripts: MyPHPScripts;
                    ${scriptNames.map(name => `export const ${name}: string;`).join("\n")}
                    export default scripts;
                }`;
            
            await fs.promises.writeFile(dtsFile, dtsContent.trim().replace(/[ \u00A0]{3,}/g, '')); //remove spaces from file content
        } catch (error) {
            console.error('[esbuild-plugin] error building php.d.ts:', error);
            throw error;
        }

        build.onResolve({ filter: new RegExp(`^${virtualModuleId}$`) }, args => {
            return {
                path: virtualModuleId,
                namespace: namespace,
            };
        });

        build.onLoad({ filter: /.*/, namespace: namespace }, async args => {
            const phpScripts = {};

            if (args.path !== virtualModuleId) {
                return null;
            }
            
            const files = await fs.promises.readdir(phpScriptsDirectory);

            for (const file of files) {
                if (!file.endsWith('.php')) {
                    continue;
                }

                const filePath = path.join(phpScriptsDirectory, file);
                const propertyName = parsePropertyName(filePath);

                phpScripts[propertyName] = filePath;
            }

            const contents = Object.keys(phpScripts).map(key => `export const ${key} = ${JSON.stringify(phpScripts[key])};`);
            contents.push(`export default ${JSON.stringify(phpScripts)};`);
            return {
                contents: contents.join("\n"),
                loader: 'js',
            };
        });
  },
};

async function main() {
	const ctx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
            esbuildPHPScriptLoaderPlugin,
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
