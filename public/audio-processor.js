class AudioRecorderWorklet extends AudioWorkletProcessor {
    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input && input.length > 0) {
            const channelData = input[0];
            // Copy the data so we can safely send it to the main thread
            const dataToPost = new Float32Array(channelData);
            this.port.postMessage(dataToPost);
        }
        // Keep the processor alive
        return true;
    }
}

registerProcessor('audio-recorder-worklet', AudioRecorderWorklet);
