<?php
//Change Directory to workspace
[1 => $workspace] = $argv;
chdir($workspace);

require_once "vendor/autoload.php";

// Parse composer namespaces' classes
$composer = json_decode(file_get_contents("composer.json"), true);
$namespaces = $composer['autoload']['psr-4'];
$classes = [];

foreach ($namespaces as $namespace => $namespacePath) {
    $namespace = rtrim($namespace, "\\");
    $classes = array_merge($classes, findModelClasses($namespace, $namespacePath));
}

// Enable Laravel kernel
(require_once "bootstrap/app.php")
    ->make(Illuminate\Contracts\Console\Kernel::class)
    ->bootstrap();

// Return output as json
echo json_encode(array_map(array: $classes, callback: 'parseModelInfo'), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
exit;

// Helper functions
if (! function_exists('class_basename')) {
    function class_basename(string|object $class)
    {
        $class = is_object($class) ? get_class($class) : $class;

        return basename(str_replace('\\', '/', $class));
    }
}

function parseModelRelations(Illuminate\Database\Eloquent\Model $model): array
{
    $reflection = new ReflectionClass($model);
    $methods = $reflection->getMethods();
    $relations = [];

    foreach ($methods as $metodo) {
        // Saltar métodos heredados
        if ($metodo->class !== get_class($model)) {
            continue;
        }

        // Ignorar métodos con parámetros
        if ($metodo->getNumberOfParameters() > 0) {
            continue;
        }

        $resultado = $metodo->invoke($model);
        if ($resultado instanceof Illuminate\Database\Eloquent\Relations\Relation) {
            $relations[] = [
                'name' => $metodo->getName(),
                'type' => class_basename($resultado),
                'relatedModel' => get_class($resultado->getRelated())
            ];
        }
    }

    return $relations;
}


function parseModelInfo(string $modelClass): array
{
    $model = new $modelClass();

    $reflection = new ReflectionClass($model);

    return [
        'name' => $reflection->getShortName(),
        'namespace' => $reflection->getNamespaceName(),
        'table' => $model->getTable(),
        'fillable' => $model->getFillable(),
        'hidden' => $model->getHidden(),
        'casts' => (object)[],
        'relationships' => parseModelRelations($model),
        'traits' => $reflection->getTraitNames(),
        'uri' => $reflection->getFileName(),
    ];
}

function findModelClasses(string $namespace, string $path): array
{
    $directory = new DirectoryIterator($path);
    $classes = [];

    foreach ($directory as $item) {
        if ($item->isDot()) {
            continue;
        }

        if ($item->isDir()) {
            $classes = [...$classes, ...findModelClasses("{$namespace}\\{$item->getBasename()}\\", $item->getRealPath())];
        }

        if (!$item->isFile()) {
            continue;
        }

        $class = str_replace($directory->getPath(), $namespace, $item->getPath()) . $item->getBasename(".php");

        if (is_subclass_of($class, Illuminate\Database\Eloquent\Model::class)) {
            $classes[] = $class;
        }
    }

    return $classes;
}
