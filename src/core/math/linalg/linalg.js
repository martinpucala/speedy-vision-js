/*
 * speedy-vision.js
 * GPU-accelerated Computer Vision for JavaScript
 * Copyright 2021 Alexandre Martins <alemartf(at)gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * linalg.js
 * Plug & Play Linear algebra methods
 */

const { MatrixType } = require('../matrix-type');
const LinAlgLib = {
    ...require('./basic'),
    ...require('./inverse'),
    ...require('./solve'),
    ...require('./qr'),
    ...require('./utils'),
};

/**
 * Plug & Play Linear Algebra methods
 * The actual Linear Algebra methods will be plugged in!
 * This is a class of static methods that can be "exported" to a WebWorker.
 * Currently, LinAlgLib methods cannot import things external to LinAlg.
 * @class
 */
const LinAlg = (function() {
'use strict';
function LinAlg() { }

/** @type {object} linear algebra library */
LinAlg.lib = Object.create(null);

/** @type {object} source code of methods */
LinAlg.lib._src = Object.create(null);

/**
 * Register a method
 * @param {string} name method name
 * @param {Function} fn function code
 */
LinAlg.register = function(name, fn)
{
    // validate
    if(typeof fn !== `function`)
        throw new Error(`Not a function: ${name}`);
    else if(typeof name !== `string` || !name.match(/^[a-z_][0-9a-z_]*$/i))
        throw new Error(`Undesirable identifier: ${name}`);
    else if(LinAlg.hasMethod(name))
        throw new Error(`Can't redefine method ${name}`);

    // register method
    const readonly = { enumerable: true, writable: false, configurable: false };
    Object.defineProperty(LinAlg.lib, name, {
        value: fn.bind(LinAlg.lib), // methods will be bound to LinAlg.lib
        ...readonly
    });
    Object.defineProperty(LinAlg.lib._src, name, {
        value: fn.toString(),
        ...readonly
    });
};

/**
 * Check if a method has been registered
 * @param {string} name method name
 * @returns {boolean}
 */
LinAlg.hasMethod = function(name)
{
    return Object.prototype.hasOwnProperty.call(LinAlg.lib, name);
}

/**
 * Convert this Plug & Play class to a string
 * @returns {string}
 */
LinAlg.toString = function()
{
    const methods = Object.keys(LinAlg.lib._src)
            .map(x => `LinAlg.lib.${x} = (${LinAlg.lib._src[x]}).bind(LinAlg.lib);`)
            .join('\n');

    return `` + // IIFE
`(function() {
'use strict';
function LinAlg() { }
LinAlg.lib = Object.create(null);
LinAlg.lib.MatrixType = (${MatrixType.toString()}).freeze();

${methods}

Object.freeze(LinAlg.lib);
return Object.freeze(LinAlg);
})()`;
};

// Import MatrixType into the lib
Object.defineProperty(LinAlg.lib, 'MatrixType', {
    value: MatrixType.freeze(),
    writable: false,
    configurable: false,
    enumerable: false,
});

// Plug in the Linear Algebra methods
Object.keys(LinAlgLib).forEach(method => {
    LinAlg.register(method, LinAlgLib[method]);
});

// done!
return Object.freeze(LinAlg);
})();

module.exports = { LinAlg };