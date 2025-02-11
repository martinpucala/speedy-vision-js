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
 * trackers.js
 * Feature trackers
 */

import { SpeedyProgramGroup } from '../speedy-program-group';
import { importShader } from '../shader-declaration';
import { PYRAMID_MAX_LEVELS } from '../../utils/globals';
import { FeatureEncoder } from '../../core/keypoints/feature-encoder';



//
// Shaders
//

// LK
const LK_MAX_WINDOW_SIZE = 21; // 21x21 window
const LK_MAX_WINDOW_SIZE_SMALL = 15; // 15x15 window - the smaller the window, the easier it is on the GPU
const LK_MAX_WINDOW_SIZE_SMALLER = 11; // 11x11 window - works best on mobile
const LK_MAX_WINDOW_SIZE_SMALLEST = 7; // 7x7 window
const LK_MIN_WINDOW_SIZE = 5; // 5x5 window: (-2, -1, 0, 1, 2) x (-2, -1, 0, 1, 2)

const lk = importShader('trackers/lk.glsl')
           .withArguments('encodedFlow', 'prevKeypoints', 'nextPyramid', 'prevPyramid', 'windowSize', 'level', 'depth', 'numberOfIterations', 'discardThreshold', 'epsilon', 'descriptorSize', 'extraSize', 'encoderLength')
           .withDefines({
               'MAX_WINDOW_SIZE': LK_MAX_WINDOW_SIZE,
           });

const lkSmall = importShader('trackers/lk.glsl')
                .withArguments('encodedFlow', 'prevKeypoints', 'nextPyramid', 'prevPyramid', 'windowSize', 'level', 'depth', 'numberOfIterations', 'discardThreshold', 'epsilon', 'descriptorSize', 'extraSize', 'encoderLength')
                .withDefines({
                    'MAX_WINDOW_SIZE': LK_MAX_WINDOW_SIZE_SMALL,
                });

const lkSmaller = importShader('trackers/lk.glsl')
                  .withArguments('encodedFlow', 'prevKeypoints', 'nextPyramid', 'prevPyramid', 'windowSize', 'level', 'depth', 'numberOfIterations', 'discardThreshold', 'epsilon', 'descriptorSize', 'extraSize', 'encoderLength')
                  .withDefines({
                      'MAX_WINDOW_SIZE': LK_MAX_WINDOW_SIZE_SMALLER,
                  });

const lkSmallest = importShader('trackers/lk.glsl')
                   .withArguments('encodedFlow', 'prevKeypoints', 'nextPyramid', 'prevPyramid', 'windowSize', 'level', 'depth', 'numberOfIterations', 'discardThreshold', 'epsilon', 'descriptorSize', 'extraSize', 'encoderLength')
                   .withDefines({
                       'MAX_WINDOW_SIZE': LK_MAX_WINDOW_SIZE_SMALLEST,
                   });

const lkDiscard = importShader('trackers/lk-discard.glsl')
                  .withArguments('pyramid', 'encodedKeypoints', 'windowSize', 'discardThreshold', 'descriptorSize', 'extraSize', 'encoderLength');

const transferFlow = importShader('trackers/transfer-flow.glsl')
                     .withArguments('encodedFlow', 'encodedKeypoints', 'descriptorSize', 'extraSize', 'encoderLength');


/**
 * GPUTrackers
 * Feature trackers
 */
export class GPUTrackers extends SpeedyProgramGroup
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
            // LK
            .declare('_lk', lk, {
                ...this.program.usesPingpongRendering()
            })
            .declare('_lkSmall', lkSmall, {
                ...this.program.usesPingpongRendering()
            })
            .declare('_lkSmaller', lkSmaller, {
                ...this.program.usesPingpongRendering()
            })
            .declare('_lkSmallest', lkSmallest, {
                ...this.program.usesPingpongRendering()
            })
            .declare('_lkDiscard', lkDiscard)

            // Transfer optical-flow
            .declare('_transferFlow', transferFlow)
        ;
    }

    /**
     * LK feature tracker
     * @param {SpeedyTexture} nextPyramid image pyramid at time t
     * @param {SpeedyTexture} prevPyramid image pyramid at time t-1
     * @param {SpeedyTexture} prevKeypoints tiny texture of encoded keypoints at time t-1
     * @param {number} windowSize neighborhood size, an odd number (5, 7, 9, 11...)
     * @param {number} depth how many pyramid layers will be scanned
     * @param {number} numberOfIterations for iterative LK
     * @param {number} discardThreshold used to discard "bad" keypoints, typically 10^(-4)
     * @param {number} epsilon accuracy threshold to stop iterations, typically 0.01
     * @param {number} descriptorSize in bytes
     * @param {number} extraSize in bytes
     * @param {number} encoderLength
     * @returns {SpeedyTexture}
     */
    lk(nextPyramid, prevPyramid, prevKeypoints, windowSize, depth, numberOfIterations, discardThreshold, epsilon, descriptorSize, extraSize, encoderLength)
    {
        // make sure we get a proper depth
        const MIN_DEPTH = 1, MAX_DEPTH = PYRAMID_MAX_LEVELS;
        depth = Math.max(MIN_DEPTH, Math.min(depth | 0, MAX_DEPTH));

        // windowSize must be a positive odd number
        windowSize = windowSize + ((windowSize + 1) % 2);
        windowSize = Math.max(LK_MIN_WINDOW_SIZE, Math.min(windowSize, LK_MAX_WINDOW_SIZE));

        // we want at least one iteration
        numberOfIterations = Math.max(1, numberOfIterations);

        // select program
        let lk = null;
        if(windowSize <= LK_MAX_WINDOW_SIZE_SMALLEST)
            lk = this._lkSmallest;
        else if(windowSize <= LK_MAX_WINDOW_SIZE_SMALLER)
            lk = this._lkSmaller;
        else if(windowSize <= LK_MAX_WINDOW_SIZE_SMALL)
            lk = this._lkSmall;
        else
            lk = this._lk;

        //
        // Optimization!
        // because this is such a demanding algorithm, we'll
        // split the work into multiple passes of the shader
        // (so we don't get WebGL context loss on mobile)
        //
        const numKeypoints = FeatureEncoder.capacity(descriptorSize, extraSize, encoderLength);
        const lkEncoderLength = Math.max(1, Math.ceil(Math.sqrt(numKeypoints)));
        lk.resize(lkEncoderLength, lkEncoderLength);

        // compute optical-flow
        let flow = lk.clear(0, 0, 0, 0);
        for(let level = depth - 1; level >= 0; level--)
            flow = lk(flow, prevKeypoints, nextPyramid, prevPyramid, windowSize, level, depth, numberOfIterations, discardThreshold, epsilon, descriptorSize, extraSize, encoderLength);

        // transfer optical-flow to nextKeypoints
        this._transferFlow.resize(encoderLength, encoderLength);
        const nextKeypoints = this._transferFlow(flow, prevKeypoints, descriptorSize, extraSize, encoderLength);

        // discard "bad" keypoints
        this._lkDiscard.resize(encoderLength, encoderLength);
        const goodKeypoints = this._lkDiscard(nextPyramid, nextKeypoints, windowSize, discardThreshold, descriptorSize, extraSize, encoderLength);

        // done!
        return goodKeypoints;
    }
}