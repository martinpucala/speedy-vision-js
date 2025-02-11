/*
 * speedy-vision.js
 * GPU-accelerated Computer Vision for JavaScript
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
 * orb.js
 * ORB features
 */

import { SpeedyGPU } from '../../../gpu/speedy-gpu';
import { FeatureDescriptionAlgorithm } from '../feature-description-algorithm';
import { FeatureAlgorithm } from '../feature-algorithm';
import { BinaryDescriptor } from '../../speedy-descriptor';
import { SpeedyFeatureWithDescriptor } from '../../speedy-feature';

// constants
const DESCRIPTOR_SIZE = 32; // 256 bits

/**
 * ORB features
 */
export class ORBFeatures extends FeatureDescriptionAlgorithm
{
    /**
     * Constructor
     * @param {FeatureAlgorithm} decoratedAlgorithm preferably Multiscale Harris
     */
    constructor(decoratedAlgorithm)
    {
        super(decoratedAlgorithm, DESCRIPTOR_SIZE);
    }

    /**
     * Compute ORB feature descriptors
     * @param {SpeedyGPU} gpu
     * @param {SpeedyTexture} inputTexture pre-processed greyscale image
     * @param {SpeedyTexture} detectedKeypoints tiny texture with appropriate size for the descriptors
     * @returns {SpeedyTexture} tiny texture with encoded keypoints & descriptors
     */
    _describe(gpu, inputTexture, detectedKeypoints)
    {
        const descriptorSize = this.descriptorSize;
        const extraSize = this.extraSize;
        const encoderLength = this.encoderLength;

        // get oriented keypoints
        const orientedKeypoints = this._computeOrientation(gpu, inputTexture, detectedKeypoints);

        // smooth the image before computing the descriptors
        const smoothTexture = gpu.programs.filters.gauss7(inputTexture);
        const smoothPyramid = smoothTexture.generatePyramid(gpu);

        // compute ORB feature descriptors
        return gpu.programs.keypoints.orb(smoothPyramid, orientedKeypoints, descriptorSize, extraSize, encoderLength);
    }

    /**
     * Compute the orientation of the keypoints
     * @param {SpeedyGPU} gpu
     * @param {SpeedyTexture} inputTexture pre-processed greyscale image
     * @param {SpeedyTexture} detectedKeypoints tiny texture with appropriate size for the descriptors
     * @returns {SpeedyTexture} tiny texture with encoded keypoints & descriptors
     */
    _computeOrientation(gpu, inputTexture, detectedKeypoints)
    {
        const descriptorSize = this.descriptorSize;
        const extraSize = this.extraSize;
        const encoderLength = this.encoderLength;

        // generate pyramid
        const pyramid = inputTexture.generatePyramid(gpu);

        // compute orientation
        return gpu.programs.keypoints.orbOrientation(pyramid, detectedKeypoints, descriptorSize, extraSize, encoderLength);
    }

    /**
     * Post-process the keypoints after downloading them
     * @param {SpeedyFeature[]} keypoints
     * @returns {SpeedyFeature[]}
     */
    _postProcess(keypoints)
    {
        return keypoints.map(
            keypoint => new SpeedyFeatureWithDescriptor(
                keypoint,
                descriptorBytes => new BinaryDescriptor(descriptorBytes)
            )
        );
    }
}