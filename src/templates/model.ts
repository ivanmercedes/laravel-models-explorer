export default (modelName: string) =>
`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;
use Illuminate\\Database\\Eloquent\\Model;

class ${modelName} extends Model
{
    use HasFactory;

    protected $fillable = [
        //
    ];

    protected $hidden = [
        //
    ];

    protected $casts = [
        //
    ];
}`;