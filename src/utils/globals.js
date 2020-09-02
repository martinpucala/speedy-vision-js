/*
 * speedy-vision.js
 * GPU-accelerated Computer Vision for the web
 * Copyright 2020 Alexandre Martins <alemartf(at)gmail.com>
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
 * globals.js
 * Global constants
 */

// -----------------------------------------------------------------
// GENERAL
// -----------------------------------------------------------------

// Maximum texture length
export const MAX_TEXTURE_LENGTH = 8190; // 2^n - 2 due to encoding
                                        // 16 bits (3 for subpixel encoding)



// -----------------------------------------------------------------
// IMAGE PYRAMIDS & SCALE-SPACE
// -----------------------------------------------------------------

// The maximum number of layers of the pyramid (not counting intra-layers)
export const PYRAMID_MAX_LEVELS = 4; // scaling factor = 1

// The maximum number of layers of the pyramid (counting intra-layers)
export const PYRAMID_MAX_OCTAVES = 2 * PYRAMID_MAX_LEVELS - 1; // scaling factor = sqrt(2)

// The maximum supported scale for a pyramid layer
export const PYRAMID_MAX_SCALE = 2; // preferably a power of 2 (image scale can go up to this value)