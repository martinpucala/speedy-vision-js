/*
 * speedy-features.js
 * GPU-accelerated feature detection and matching for Computer Vision on the web
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
 * feature-detector.js
 * Feature detection facade
 */

import { GPUKernels } from '../gpu/gpu-kernels';
import { Utils } from '../utils/utils';

/**
 * FeatureDetector encapsulates
 * feature detection algorithms
 */
export class FeatureDetector
{
    /**
     * Class constructor
     * @param {SpeedyMedia} media
     */
    constructor(media)
    {
        this._media = media;
        this._gpu = new GPUKernels(media.width, media.height);
    }

    /**
     * FAST corner detection
     * @param {number} [n] We'll run FAST-n, where n must be 9 (default), 7 or 5
     * @param {object} [userSettings]
     * @returns {Array<SpeedyFeature>} keypoints
     */
    fast(n = 9, userSettings = { })
    {
        // create settings object
        const settings = Object.assign({ }, {
            // default settings
            threshold: 10,
            denoise: true,
        }, userSettings);

        // convert a sensitivity value in [0,1],
        // if it's defined, to a FAST threshold
        if(settings.hasOwnProperty('sensitivity')) {
            const sensitivity = Math.max(0, Math.min(settings.sensitivity, 1));
            settings.threshold = 1 - Math.tanh(2.77 * sensitivity);
        }
        else {
            const threshold = Math.max(0, Math.min(settings.threshold, 255));
            settings.threshold = threshold / 255;
        }

        // validate input
        if(n != 9 && n != 5 && n != 7)
            Utils.fatal(`Not implemented: FAST-${n}`); // this shouldn't happen...

        // pre-processing the image...
        const smoothed = settings.denoise ?
            this._gpu.filters.gauss1(this._media.source) :
            this._media.source;
        const greyscale = this._gpu.colors.rgb2grey(smoothed);

        // keypoint detection
        const rawCorners = (({
            5:  () => this._gpu.keypoints.fast5(greyscale, settings.threshold),
            7:  () => this._gpu.keypoints.fast7(greyscale, settings.threshold),
            9:  () => this._gpu.keypoints.fast9(greyscale, settings.threshold),
        })[n])();
        const corners = this._gpu.keypoints.fastSuppression(rawCorners);

        // encoding result
        const offsets = this._gpu.encoders.encodeKeypointOffsets(corners);
        const keypointCount = this._gpu.encoders.countKeypoints(offsets);
        this._gpu.encoders.optimizeKeypointEncoder(keypointCount);
        const pixels = this._gpu.encoders.encodeKeypoints(offsets);
        return this._gpu.encoders.decodeKeypoints(pixels);
    }
}