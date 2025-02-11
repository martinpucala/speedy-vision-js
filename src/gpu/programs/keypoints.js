/*
 * speedy-vision.js
 * GPU-accelerated Computer Vision for JavaScript
 * Copyright 2020-2021 Alexandre Martins <alemartf(at)gmail.com>
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
 * keypoints.js
 * Facade for various keypoint detection algorithms
 */

import { SpeedyProgramGroup } from '../speedy-program-group';
import { importShader } from '../shader-declaration';
import { FeatureEncoder } from '../../core/keypoints/feature-encoder';
import { PYRAMID_MAX_LEVELS } from '../../utils/globals';
import { Utils } from '../../utils/utils';



//
// FAST corner detector
//

// FAST-9_16: requires 9 contiguous pixels
// on a circumference of 16 pixels
const fast9 = importShader('keypoints/fast/fast9.glsl').withArguments('image', 'threshold');

// FAST-7_12: requires 7 contiguous pixels
// on a circumference of 12 pixels
const fast7 = importShader('keypoints/fast/fast7.glsl').withArguments('image', 'threshold');

// FAST-5_8: requires 5 contiguous pixels
// on a circumference of 8 pixels
const fast5 = importShader('keypoints/fast/fast5.glsl').withArguments('image', 'threshold');

// compute corner score considering a
// neighboring circumference of 16 pixels
const fastScore16 = importShader('keypoints/fast/fast-score16.glsl').withArguments('image', 'threshold');

// compute corner score considering a
// neighboring circumference of 12 pixels
const fastScore12 = importShader('keypoints/fast/fast-score12.glsl').withArguments('image', 'threshold');

// compute corner score considering a
// neighboring circumference of 8 pixels
const fastScore8 = importShader('keypoints/fast/fast-score8.glsl').withArguments('image', 'threshold');

// FAST-9_16 on scale-space
// Requires image mipmap
const multiscaleFast = importShader('keypoints/fast/multiscale-fast.glsl')
                      .withArguments('pyramid', 'threshold', 'numberOfLayers', 'lodStep');

// encode FAST score in an 8-bit component
const encodeFastScore = importShader('keypoints/fast/encode-fast-score.glsl').withArguments('image');



//
// Harris-Shi-Tomasi corner detector
//

// compute corner responses (score map)
const multiscaleHarris = importShader('keypoints/harris/multiscale-harris.glsl')
                        .withDefines({ 'MAX_LAYERS': 2 * PYRAMID_MAX_LEVELS - 1 })
                        .withArguments('pyramid', 'windowSize', 'numberOfLayers', 'lodStep', 'sobelDerivatives');

// discard corners below a specified quality level
const harrisCutoff = importShader('keypoints/harris/harris-cutoff.glsl').withArguments('corners', 'maxScore', 'quality');

// encode harris score in an 8-bit component
const encodeHarrisScore = importShader('keypoints/harris/encode-harris-score.glsl').withArguments('image');

// find the maximum harris score in an image
const maxHarrisScore = importShader('keypoints/harris/max-harris-score.glsl').withArguments('self', 'iterationNumber');

// Sobel derivatives
const multiscaleSobel = importShader('keypoints/harris/multiscale-sobel.glsl').withArguments('pyramid', 'lod');



//
// BRISK feature detection
//
const brisk = importShader('keypoints/brisk.glsl')
             .withArguments('image', 'layerA', 'layerB', 'scaleA', 'scaleB', 'lgM', 'h');



//
// ORB feature description
//
const orb = importShader('keypoints/orb/orb-descriptor.glsl')
           .withArguments('pyramid', 'encodedCorners', 'extraSize', 'encoderLength');

const orbOrientation = importShader('keypoints/orb/orb-orientation.glsl')
                      .withArguments('pyramid', 'encodedKeypoints', 'descriptorSize', 'extraSize', 'encoderLength');




//
// Generic keypoint routines
//

// non-maximum suppression
const nonMaxSuppression = importShader('keypoints/nonmax-suppression.glsl')
                         .withArguments('image', 'lodStep');
const multiscaleNonMaxSuppression = importShader('keypoints/nonmax-suppression.glsl')
                                   .withArguments('image', 'lodStep')
                                   .withDefines({ 'MULTISCALE': 1 });

// transfer keypoint orientation
const transferOrientation = importShader('keypoints/transfer-orientation.glsl')
                           .withArguments('encodedOrientations', 'encodedKeypoints', 'descriptorSize', 'extraSize', 'encoderLength');

// suppress feature descriptors
const suppressDescriptors = importShader('keypoints/suppress-descriptors.glsl')
                           .withArguments('encodedKeypoints', 'descriptorSize', 'extraSize', 'encoderLength', 'suppressedEncoderLength');



/**
 * GPUKeypoints
 * Keypoint detection
 */
export class GPUKeypoints extends SpeedyProgramGroup
{
    /**
     * Class constructor
     * @param {SpeedyGPU} gpu
     * @param {number} width
     * @param {number} height
     */
    constructor(gpu, width, height)
    {
        super(gpu, width, height);
        this
            // FAST-9,16
            .compose('fast9', '_fast9', '_fastScore16')
            .declare('_fast9', fast9) // find corners
            .declare('_fastScore16', fastScore16) // compute scores

            // FAST-7,12
            .compose('fast7', '_fast7', '_fastScore12')
            .declare('_fast7', fast7)
            .declare('_fastScore12', fastScore12)

            // FAST-5,8
            .compose('fast5', '_fast5', '_fastScore8')
            .declare('_fast5', fast5)
            .declare('_fastScore8', fastScore8)

            // FAST-9,16 (multi-scale)
            .declare('multiscaleFast', multiscaleFast)
            .declare('encodeFastScore', encodeFastScore)

            // BRISK Scale-Space Non-Maximum Suppression & Interpolation
            .declare('brisk', brisk)

            // Harris-Shi-Tomasi corner detector
            .declare('multiscaleHarris', multiscaleHarris) // scale-space
            .declare('harrisCutoff', harrisCutoff)
            .declare('encodeHarrisScore', encodeHarrisScore)
            .declare('maxHarrisScore', maxHarrisScore, {
                ...this.program.usesPingpongRendering()
            })

            // Non-maximum suppression
            .declare('_nonMaxSuppression', nonMaxSuppression)
            .declare('_multiscaleNonMaxSuppression', multiscaleNonMaxSuppression)

            // ORB
            .declare('_orb', orb)
            .declare('_orbOrientation', orbOrientation)
            .declare('multiscaleSobel', multiscaleSobel, {
                ...this.program.doesNotRecycleTextures()
            }) // scale-space

            // Transfer keypoint orientation
            .declare('_transferOrientation', transferOrientation)

            // Suppress feature descriptors
            .declare('_suppressDescriptors', suppressDescriptors)
        ;
    }

    /**
     * Non-maximum suppression
     * @param {SpeedyTexture} corners scores are encoded as float16
     * @param {number} [lodStep] log2(scaleFactor) - specify if multi-scale
     * @returns {SpeedyTexture}
     */
    nonMaxSuppression(corners, lodStep = 0)
    {
        if(lodStep > 0)
            return this._multiscaleNonMaxSuppression(corners, lodStep);
        else
            return this._nonMaxSuppression(corners, 0);
    }

    /**
     * Compute ORB descriptor (256 bits)
     * @param {SpeedyTexture} pyramid pre-smoothed on the intensity channel
     * @param {SpeedyTexture} encodedKeypoints tiny texture
     * @param {number} descriptorSize in bytes
     * @param {number} extraSize in bytes
     * @param {number} encoderLength
     * @returns {SpeedyTexture}
     */
    orb(pyramid, encodedKeypoints, descriptorSize, extraSize, encoderLength)
    {
        Utils.assert(descriptorSize === 32);
        this._orb.resize(encoderLength, encoderLength);
        return this._orb(pyramid, encodedKeypoints, extraSize, encoderLength);
    }

    /**
     * Finds the orientation of all keypoints given a texture with encoded keypoints
     * (using the centroid method, as in ORB)
     * @param {SpeedyTexture} pyramid image pyramid
     * @param {SpeedyTexture} encodedKeypoints tiny texture
     * @param {number} descriptorSize in bytes
     * @param {number} extraSize in bytes
     * @param {number} encoderLength
     * @returns {SpeedyTexture}
     */
    orbOrientation(pyramid, encodedKeypoints, descriptorSize, extraSize, encoderLength)
    {
        const numberOfKeypoints = FeatureEncoder.capacity(descriptorSize, extraSize, encoderLength);
        const orientationEncoderLength = Math.max(1, Math.ceil(Math.sqrt(numberOfKeypoints))); // 1 pixel per keypoint

        this._orbOrientation.resize(orientationEncoderLength, orientationEncoderLength);
        const encodedOrientations = this._orbOrientation(pyramid, encodedKeypoints, descriptorSize, extraSize, encoderLength);

        this._transferOrientation.resize(encoderLength, encoderLength);
        return this._transferOrientation(encodedOrientations, encodedKeypoints, descriptorSize, extraSize, encoderLength);
    }

    /**
     * Suppress feature descriptors from a texture with encoded keypoints
     * @param {SpeedyTexture} encodedKeypoints tiny texture
     * @param {number} descriptorSize in bytes
     * @param {number} extraSize in bytes
     * @param {number} encoderLength
     * @param {number} suppressedEncoderLength equivalent to encoderLength, but without the descriptors
     * @returns {SpeedyTexture}
     */
    suppressDescriptors(encodedKeypoints, descriptorSize, extraSize, encoderLength, suppressedEncoderLength)
    {
        Utils.assert(suppressedEncoderLength <= encoderLength);
        this._suppressDescriptors.resize(suppressedEncoderLength, suppressedEncoderLength);
        return this._suppressDescriptors(encodedKeypoints, descriptorSize, extraSize, encoderLength, suppressedEncoderLength);
    }
}