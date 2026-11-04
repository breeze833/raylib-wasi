// raudio_wasi.c - Pure WASI & Web Audio implementation of Raylib Audio API
// Compatible with vanilla wasm32-wasi without Emscripten or miniaudio threading

#include "raylib.h"
#include "utils.h"

#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <math.h>

#define SUPPORT_FILEFORMAT_WAV  1
#define SUPPORT_FILEFORMAT_OGG  1
#define SUPPORT_FILEFORMAT_MP3  1
#define SUPPORT_FILEFORMAT_QOA  1
#define SUPPORT_FILEFORMAT_FLAC 1

#ifndef RL_MALLOC
    #define RL_MALLOC(sz)       malloc(sz)
#endif
#ifndef RL_CALLOC
    #define RL_CALLOC(n, sz)    calloc(n, sz)
#endif
#ifndef RL_REALLOC
    #define RL_REALLOC(ptr, sz) realloc(ptr, sz)
#endif
#ifndef RL_FREE
    #define RL_FREE(ptr)        free(ptr)
#endif

// --- External Decoders ---
#if defined(SUPPORT_FILEFORMAT_WAV)
    #define DRWAV_MALLOC  RL_MALLOC
    #define DRWAV_REALLOC RL_REALLOC
    #define DRWAV_FREE    RL_FREE
    #define DR_WAV_IMPLEMENTATION
    #include "external/dr_wav.h"
#endif

#if defined(SUPPORT_FILEFORMAT_OGG)
    #include "external/stb_vorbis.c"
#endif

#if defined(SUPPORT_FILEFORMAT_MP3)
    #define DRMP3_MALLOC  RL_MALLOC
    #define DRMP3_REALLOC RL_REALLOC
    #define DRMP3_FREE    RL_FREE
    #define DR_MP3_IMPLEMENTATION
    #include "external/dr_mp3.h"
#endif

#if defined(SUPPORT_FILEFORMAT_QOA)
    #define QOA_MALLOC RL_MALLOC
    #define QOA_FREE   RL_FREE
    #define QOA_IMPLEMENTATION
    #include "external/qoa.h"
    #include "external/qoaplay.c"
#endif

#if defined(SUPPORT_FILEFORMAT_FLAC)
    #define DRFLAC_MALLOC RL_MALLOC
    #define DRFLAC_REALLOC RL_REALLOC
    #define DRFLAC_FREE RL_FREE
    #define DR_FLAC_IMPLEMENTATION
    #define DR_FLAC_NO_WIN32_IO
    #include "external/dr_flac.h"
#endif

// --- Music Context Types ---
typedef enum {
    MUSIC_AUDIO_WAV = 0,
    MUSIC_AUDIO_OGG,
    MUSIC_AUDIO_FLAC,
    MUSIC_AUDIO_MP3,
    MUSIC_AUDIO_QOA
} MusicContextType;

// --- Internal Audio Structures ---
struct rAudioProcessor {
    AudioCallback process;
    rAudioProcessor *next;
    rAudioProcessor *prev;
};

struct rAudioBuffer {
    int bufferId;      // Web Audio AudioBuffer handle
    int voiceId;       // Active Web Audio voice instance handle
    int streamId;      // Active Web Audio stream queue handle

    float volume;
    float pitch;
    float pan;
    bool playing;
    bool paused;
    bool looping;
    int usage;         // 0: STATIC, 1: STREAM

    unsigned int sizeInFrames;
    unsigned int framesProcessed;
    unsigned char *data;

    AudioCallback callback;
    rAudioProcessor *processor;

    struct rAudioBuffer *next;
    struct rAudioBuffer *prev;
};

typedef struct AudioData {
    struct {
        bool isReady;
        size_t pcmBufferSize;
        void *pcmBuffer;
    } System;
    struct {
        rAudioBuffer *first;
        rAudioBuffer *last;
        int defaultSize;
    } Buffer;
    rAudioProcessor *mixedProcessor;
} AudioData;

static AudioData AUDIO = {
    .System.isReady = false,
    .System.pcmBufferSize = 0,
    .System.pcmBuffer = NULL,
    .Buffer.defaultSize = 0,
    .mixedProcessor = NULL
};

// --- WebAssembly Host Imports ---
#define RAYLIB_AUDIO_IMPORT(name) __attribute__((import_module("raylib"), import_name(#name)))

RAYLIB_AUDIO_IMPORT(raylib_host_audio_init)
int raylib_host_audio_init(void);

RAYLIB_AUDIO_IMPORT(raylib_host_audio_close)
void raylib_host_audio_close(void);

RAYLIB_AUDIO_IMPORT(raylib_host_audio_is_ready)
int raylib_host_audio_is_ready(void);

RAYLIB_AUDIO_IMPORT(raylib_host_audio_set_master_volume)
void raylib_host_audio_set_master_volume(float volume);

RAYLIB_AUDIO_IMPORT(raylib_host_audio_get_master_volume)
float raylib_host_audio_get_master_volume(void);

RAYLIB_AUDIO_IMPORT(raylib_host_audio_create_buffer)
int raylib_host_audio_create_buffer(int channels, int sampleRate, int sampleSize, int frameCount, const void *data);

RAYLIB_AUDIO_IMPORT(raylib_host_audio_update_buffer)
void raylib_host_audio_update_buffer(int bufferId, const void *data, int frameCount);

RAYLIB_AUDIO_IMPORT(raylib_host_audio_destroy_buffer)
void raylib_host_audio_destroy_buffer(int bufferId);

RAYLIB_AUDIO_IMPORT(raylib_host_audio_play)
int raylib_host_audio_play(int bufferId, float volume, float pitch, float pan, int loop);

RAYLIB_AUDIO_IMPORT(raylib_host_audio_stop)
void raylib_host_audio_stop(int voiceId);

RAYLIB_AUDIO_IMPORT(raylib_host_audio_pause)
void raylib_host_audio_pause(int voiceId);

RAYLIB_AUDIO_IMPORT(raylib_host_audio_resume)
void raylib_host_audio_resume(int voiceId);

RAYLIB_AUDIO_IMPORT(raylib_host_audio_is_playing)
int raylib_host_audio_is_playing(int voiceId);

RAYLIB_AUDIO_IMPORT(raylib_host_audio_set_volume)
void raylib_host_audio_set_volume(int voiceId, float volume);

RAYLIB_AUDIO_IMPORT(raylib_host_audio_set_pitch)
void raylib_host_audio_set_pitch(int voiceId, float pitch);

RAYLIB_AUDIO_IMPORT(raylib_host_audio_set_pan)
void raylib_host_audio_set_pan(int voiceId, float pan);

RAYLIB_AUDIO_IMPORT(raylib_host_audio_stream_init)
int raylib_host_audio_stream_init(int channels, int sampleRate, int sampleSize);

RAYLIB_AUDIO_IMPORT(raylib_host_audio_stream_destroy)
void raylib_host_audio_stream_destroy(int streamId);

RAYLIB_AUDIO_IMPORT(raylib_host_audio_stream_feed)
void raylib_host_audio_stream_feed(int streamId, const void *data, int frameCount);

RAYLIB_AUDIO_IMPORT(raylib_host_audio_stream_play)
void raylib_host_audio_stream_play(int streamId);

RAYLIB_AUDIO_IMPORT(raylib_host_audio_stream_pause)
void raylib_host_audio_stream_pause(int streamId);

RAYLIB_AUDIO_IMPORT(raylib_host_audio_stream_resume)
void raylib_host_audio_stream_resume(int streamId);

RAYLIB_AUDIO_IMPORT(raylib_host_audio_stream_stop)
void raylib_host_audio_stream_stop(int streamId);

RAYLIB_AUDIO_IMPORT(raylib_host_audio_stream_is_playing)
int raylib_host_audio_stream_is_playing(int streamId);

RAYLIB_AUDIO_IMPORT(raylib_host_audio_stream_set_volume)
void raylib_host_audio_stream_set_volume(int streamId, float volume);

RAYLIB_AUDIO_IMPORT(raylib_host_audio_stream_set_pitch)
void raylib_host_audio_stream_set_pitch(int streamId, float pitch);

RAYLIB_AUDIO_IMPORT(raylib_host_audio_stream_set_pan)
void raylib_host_audio_stream_set_pan(int streamId, float pan);

// --- AudioBuffer Linked List Helpers ---
static void TrackAudioBuffer(rAudioBuffer *buffer)
{
    if (AUDIO.Buffer.first == NULL) AUDIO.Buffer.first = buffer;
    else
    {
        AUDIO.Buffer.last->next = buffer;
        buffer->prev = AUDIO.Buffer.last;
    }
    AUDIO.Buffer.last = buffer;
}

static void UntrackAudioBuffer(rAudioBuffer *buffer)
{
    if (buffer->prev == NULL) AUDIO.Buffer.first = buffer->next;
    else buffer->prev->next = buffer->next;

    if (buffer->next == NULL) AUDIO.Buffer.last = buffer->prev;
    else buffer->next->prev = buffer->prev;

    buffer->prev = NULL;
    buffer->next = NULL;
}

// ==================================================================================
// Audio Device Management Functions
// ==================================================================================

void InitAudioDevice(void)
{
    if (AUDIO.System.isReady)
    {
        TRACELOG(LOG_WARNING, "AUDIO: Device already initialized");
        return;
    }

    int res = raylib_host_audio_init();
    if (res != 0)
    {
        TRACELOG(LOG_WARNING, "AUDIO: Failed to initialize host audio device");
        return;
    }

    // Allocate 64KB PCM mixing/streaming buffer
    AUDIO.System.pcmBufferSize = 65536;
    AUDIO.System.pcmBuffer = RL_MALLOC(AUDIO.System.pcmBufferSize);
    AUDIO.System.isReady = true;

    TRACELOG(LOG_INFO, "AUDIO: Device initialized successfully via Web Audio bridge");
}

void CloseAudioDevice(void)
{
    if (!AUDIO.System.isReady)
    {
        TRACELOG(LOG_WARNING, "AUDIO: Device could not be closed, not currently initialized");
        return;
    }

    raylib_host_audio_close();

    if (AUDIO.System.pcmBuffer != NULL)
    {
        RL_FREE(AUDIO.System.pcmBuffer);
        AUDIO.System.pcmBuffer = NULL;
    }
    AUDIO.System.pcmBufferSize = 0;
    AUDIO.System.isReady = false;

    TRACELOG(LOG_INFO, "AUDIO: Device closed successfully");
}

bool IsAudioDeviceReady(void)
{
    return AUDIO.System.isReady && (raylib_host_audio_is_ready() != 0);
}

void SetMasterVolume(float volume)
{
    if (volume < 0.0f) volume = 0.0f;
    raylib_host_audio_set_master_volume(volume);
}

float GetMasterVolume(void)
{
    return raylib_host_audio_get_master_volume();
}

// ==================================================================================
// Wave / Decoders Loading & Management Functions
// ==================================================================================

Wave LoadWave(const char *fileName)
{
    Wave wave = { 0 };
    int dataSize = 0;
    unsigned char *fileData = LoadFileData(fileName, &dataSize);

    if (fileData != NULL)
    {
        wave = LoadWaveFromMemory(GetFileExtension(fileName), fileData, dataSize);
        UnloadFileData(fileData);
    }
    return wave;
}

Wave LoadWaveFromMemory(const char *fileType, const unsigned char *fileData, int dataSize)
{
    Wave wave = { 0 };
    if (!fileData || dataSize <= 0) return wave;

#if defined(SUPPORT_FILEFORMAT_WAV)
    if (IsFileExtension(fileType, ".wav"))
    {
        drwav wav;
        if (drwav_init_memory(&wav, fileData, dataSize, NULL))
        {
            wave.frameCount = (unsigned int)wav.totalPCMFrameCount;
            wave.channels = wav.channels;
            wave.sampleRate = wav.sampleRate;
            wave.sampleSize = 16;
            wave.data = RL_MALLOC(wave.frameCount * wave.channels * (wave.sampleSize / 8));
            drwav_read_pcm_frames_s16(&wav, wave.frameCount, (drwav_int16 *)wave.data);
            drwav_uninit(&wav);
        }
        return wave;
    }
#endif

#if defined(SUPPORT_FILEFORMAT_OGG)
    if (IsFileExtension(fileType, ".ogg"))
    {
        int channels = 0;
        int sampleRate = 0;
        short *output = NULL;
        int samples = stb_vorbis_decode_memory(fileData, dataSize, &channels, &sampleRate, &output);
        if (samples > 0)
        {
            wave.frameCount = (unsigned int)samples;
            wave.channels = (unsigned int)channels;
            wave.sampleRate = (unsigned int)sampleRate;
            wave.sampleSize = 16;
            wave.data = output;
        }
        return wave;
    }
#endif

#if defined(SUPPORT_FILEFORMAT_MP3)
    if (IsFileExtension(fileType, ".mp3"))
    {
        drmp3_config config;
        drmp3_uint64 totalFrameCount = 0;
        float *pcmData = drmp3_open_memory_and_read_pcm_frames_f32(fileData, dataSize, &config, &totalFrameCount, NULL);
        if (pcmData)
        {
            wave.frameCount = (unsigned int)totalFrameCount;
            wave.channels = config.channels;
            wave.sampleRate = config.sampleRate;
            wave.sampleSize = 32;
            wave.data = pcmData;
        }
        return wave;
    }
#endif

#if defined(SUPPORT_FILEFORMAT_FLAC)
    if (IsFileExtension(fileType, ".flac"))
    {
        unsigned int channels = 0;
        unsigned int sampleRate = 0;
        drflac_uint64 totalFrameCount = 0;
        drflac_int16 *pcmData = drflac_open_memory_and_read_pcm_frames_s16(fileData, dataSize, &channels, &sampleRate, &totalFrameCount, NULL);
        if (pcmData)
        {
            wave.frameCount = (unsigned int)totalFrameCount;
            wave.channels = channels;
            wave.sampleRate = sampleRate;
            wave.sampleSize = 16;
            wave.data = pcmData;
        }
        return wave;
    }
#endif

#if defined(SUPPORT_FILEFORMAT_QOA)
    if (IsFileExtension(fileType, ".qoa"))
    {
        qoa_desc qoa;
        short *pcmData = (short *)qoa_decode(fileData, dataSize, &qoa);
        if (pcmData)
        {
            wave.frameCount = qoa.samples;
            wave.channels = qoa.channels;
            wave.sampleRate = qoa.samplerate;
            wave.sampleSize = 16;
            wave.data = pcmData;
        }
        return wave;
    }
#endif

    TRACELOG(LOG_WARNING, "WAVE: File type not supported or invalid audio data");
    return wave;
}

bool IsWaveValid(Wave wave)
{
    return (wave.data != NULL) && (wave.frameCount > 0) && (wave.sampleRate > 0) && (wave.channels > 0);
}

void UnloadWave(Wave wave)
{
    if (wave.data != NULL)
    {
        RL_FREE(wave.data);
    }
}

Wave WaveCopy(Wave wave)
{
    Wave newWave = { 0 };
    if (!IsWaveValid(wave)) return newWave;

    size_t sizeInBytes = wave.frameCount * wave.channels * (wave.sampleSize / 8);
    newWave.data = RL_MALLOC(sizeInBytes);
    if (newWave.data != NULL)
    {
        memcpy(newWave.data, wave.data, sizeInBytes);
        newWave.frameCount = wave.frameCount;
        newWave.sampleRate = wave.sampleRate;
        newWave.sampleSize = wave.sampleSize;
        newWave.channels = wave.channels;
    }
    return newWave;
}

void WaveCrop(Wave *wave, int initFrame, int finalFrame)
{
    if (!wave || !wave->data || initFrame < 0 || initFrame >= finalFrame || (unsigned int)finalFrame > wave->frameCount)
    {
        TRACELOG(LOG_WARNING, "WAVE: Crop range out of bounds");
        return;
    }

    int frameCount = finalFrame - initFrame;
    size_t frameSize = wave->channels * (wave->sampleSize / 8);
    void *data = RL_MALLOC(frameCount * frameSize);

    memcpy(data, (unsigned char *)wave->data + (initFrame * frameSize), frameCount * frameSize);
    RL_FREE(wave->data);

    wave->data = data;
    wave->frameCount = (unsigned int)frameCount;
}

void WaveFormat(Wave *wave, int sampleRate, int sampleSize, int channels)
{
    if (!wave || !wave->data || !wave->frameCount) return;
    if (wave->sampleRate == (unsigned int)sampleRate && wave->sampleSize == (unsigned int)sampleSize && wave->channels == (unsigned int)channels) return;

    // Convert existing samples to normalized float [-1.0 .. 1.0]
    float *floats = LoadWaveSamples(*wave);
    if (!floats) return;

    unsigned int srcFrames = wave->frameCount;
    unsigned int srcChannels = wave->channels;

    // Linear sample rate resampling
    double ratio = (double)sampleRate / (double)wave->sampleRate;
    unsigned int dstFrames = (unsigned int)(srcFrames * ratio);
    if (dstFrames == 0) dstFrames = 1;

    float *resampled = (float *)RL_MALLOC(dstFrames * channels * sizeof(float));

    for (unsigned int i = 0; i < dstFrames; i++)
    {
        double srcPos = (double)i / ratio;
        unsigned int idx0 = (unsigned int)srcPos;
        unsigned int idx1 = (idx0 + 1 < srcFrames) ? idx0 + 1 : idx0;
        float frac = (float)(srcPos - idx0);

        for (int ch = 0; ch < channels; ch++)
        {
            int srcCh = (srcChannels == 1) ? 0 : (ch < (int)srcChannels ? ch : 0);
            float s0 = floats[idx0 * srcChannels + srcCh];
            float s1 = floats[idx1 * srcChannels + srcCh];
            resampled[i * channels + ch] = s0 + frac * (s1 - s0);
        }
    }

    UnloadWaveSamples(floats);

    // Convert resampled floats to requested sampleSize
    size_t outBytes = dstFrames * channels * (sampleSize / 8);
    void *outData = RL_MALLOC(outBytes);

    if (sampleSize == 16)
    {
        short *out16 = (short *)outData;
        for (unsigned int i = 0; i < dstFrames * channels; i++)
        {
            float val = resampled[i];
            if (val > 1.0f) val = 1.0f;
            else if (val < -1.0f) val = -1.0f;
            out16[i] = (short)(val * 32767.0f);
        }
    }
    else if (sampleSize == 32)
    {
        memcpy(outData, resampled, outBytes);
    }
    else if (sampleSize == 8)
    {
        unsigned char *out8 = (unsigned char *)outData;
        for (unsigned int i = 0; i < dstFrames * channels; i++)
        {
            float val = resampled[i];
            if (val > 1.0f) val = 1.0f;
            else if (val < -1.0f) val = -1.0f;
            out8[i] = (unsigned char)((val + 1.0f) * 127.5f);
        }
    }

    RL_FREE(resampled);
    RL_FREE(wave->data);

    wave->data = outData;
    wave->frameCount = dstFrames;
    wave->sampleRate = sampleRate;
    wave->sampleSize = sampleSize;
    wave->channels = channels;
}

float *LoadWaveSamples(Wave wave)
{
    if (!IsWaveValid(wave)) return NULL;

    float *samples = (float *)RL_MALLOC(wave.frameCount * wave.channels * sizeof(float));
    unsigned int totalSamples = wave.frameCount * wave.channels;

    if (wave.sampleSize == 8)
    {
        unsigned char *p = (unsigned char *)wave.data;
        for (unsigned int i = 0; i < totalSamples; i++)
        {
            samples[i] = ((float)p[i] - 128.0f) / 128.0f;
        }
    }
    else if (wave.sampleSize == 16)
    {
        short *p = (short *)wave.data;
        for (unsigned int i = 0; i < totalSamples; i++)
        {
            samples[i] = (float)p[i] / 32768.0f;
        }
    }
    else if (wave.sampleSize == 32)
    {
        memcpy(samples, wave.data, totalSamples * sizeof(float));
    }

    return samples;
}

void UnloadWaveSamples(float *samples)
{
    if (samples != NULL) RL_FREE(samples);
}

bool ExportWave(Wave wave, const char *fileName)
{
    if (!IsWaveValid(wave) || !fileName) return false;
    bool success = false;

#if defined(SUPPORT_FILEFORMAT_WAV)
    if (IsFileExtension(fileName, ".wav"))
    {
        drwav wav = { 0 };
        drwav_data_format format = { 0 };
        format.container = drwav_container_riff;
        format.format = (wave.sampleSize == 32) ? DR_WAVE_FORMAT_IEEE_FLOAT : DR_WAVE_FORMAT_PCM;
        format.channels = wave.channels;
        format.sampleRate = wave.sampleRate;
        format.bitsPerSample = wave.sampleSize;

        void *fileData = NULL;
        size_t fileDataSize = 0;
        if (drwav_init_memory_write(&wav, &fileData, &fileDataSize, &format, NULL))
        {
            drwav_write_pcm_frames(&wav, wave.frameCount, wave.data);
            drwav_uninit(&wav);
            success = SaveFileData(fileName, (unsigned char *)fileData, (unsigned int)fileDataSize);
            drwav_free(fileData, NULL);
        }
    }
#endif

    return success;
}

bool ExportWaveAsCode(Wave wave, const char *fileName)
{
    if (!IsWaveValid(wave) || !fileName) return false;
    // Export raw samples array as C header code
    FILE *f = fopen(fileName, "w");
    if (!f) return false;

    fprintf(f, "// Wave sample data exported by raylib-wasi\n");
    fprintf(f, "#define WAVE_FRAME_COUNT %u\n", wave.frameCount);
    fprintf(f, "#define WAVE_SAMPLE_RATE %u\n", wave.sampleRate);
    fprintf(f, "#define WAVE_SAMPLE_SIZE %u\n", wave.sampleSize);
    fprintf(f, "#define WAVE_CHANNELS    %u\n\n", wave.channels);

    float *samples = LoadWaveSamples(wave);
    unsigned int total = wave.frameCount * wave.channels;
    fprintf(f, "static const float wave_data[%u] = {\n", total);
    for (unsigned int i = 0; i < total; i++)
    {
        fprintf(f, "%.4ff%s", samples[i], (i + 1 == total) ? "" : ", ");
        if ((i + 1) % 10 == 0) fprintf(f, "\n");
    }
    fprintf(f, "\n};\n");
    UnloadWaveSamples(samples);
    fclose(f);
    return true;
}

// ==================================================================================
// Sound Loading & Management Functions
// ==================================================================================

Sound LoadSound(const char *fileName)
{
    Wave wave = LoadWave(fileName);
    Sound sound = LoadSoundFromWave(wave);
    UnloadWave(wave);
    return sound;
}

Sound LoadSoundFromWave(Wave wave)
{
    Sound sound = { 0 };
    if (!IsWaveValid(wave)) return sound;

    int bufId = raylib_host_audio_create_buffer(wave.channels, wave.sampleRate, wave.sampleSize, wave.frameCount, wave.data);
    if (bufId <= 0)
    {
        TRACELOG(LOG_WARNING, "SOUND: Failed to register audio buffer on host");
        return sound;
    }

    rAudioBuffer *audioBuffer = (rAudioBuffer *)RL_CALLOC(1, sizeof(rAudioBuffer));
    audioBuffer->bufferId = bufId;
    audioBuffer->volume = 1.0f;
    audioBuffer->pitch = 1.0f;
    audioBuffer->pan = 0.5f;
    audioBuffer->sizeInFrames = wave.frameCount;
    audioBuffer->usage = 0; // STATIC

    TrackAudioBuffer(audioBuffer);

    sound.frameCount = wave.frameCount;
    sound.stream.sampleRate = wave.sampleRate;
    sound.stream.sampleSize = wave.sampleSize;
    sound.stream.channels = wave.channels;
    sound.stream.buffer = audioBuffer;

    return sound;
}

Sound LoadSoundAlias(Sound source)
{
    Sound sound = { 0 };
    if (!IsSoundValid(source)) return sound;

    rAudioBuffer *audioBuffer = (rAudioBuffer *)RL_CALLOC(1, sizeof(rAudioBuffer));
    audioBuffer->bufferId = source.stream.buffer->bufferId; // Share host audio buffer
    audioBuffer->volume = source.stream.buffer->volume;
    audioBuffer->pitch = source.stream.buffer->pitch;
    audioBuffer->pan = source.stream.buffer->pan;
    audioBuffer->sizeInFrames = source.frameCount;
    audioBuffer->usage = 0;

    TrackAudioBuffer(audioBuffer);

    sound.frameCount = source.frameCount;
    sound.stream.sampleRate = source.stream.sampleRate;
    sound.stream.sampleSize = source.stream.sampleSize;
    sound.stream.channels = source.stream.channels;
    sound.stream.buffer = audioBuffer;

    return sound;
}

bool IsSoundValid(Sound sound)
{
    return (sound.stream.buffer != NULL) && (sound.stream.buffer->bufferId > 0) && (sound.frameCount > 0);
}

void UpdateSound(Sound sound, const void *data, int sampleCount)
{
    if (IsSoundValid(sound) && data && sampleCount > 0)
    {
        raylib_host_audio_update_buffer(sound.stream.buffer->bufferId, data, sampleCount);
    }
}

void UnloadSound(Sound sound)
{
    if (sound.stream.buffer != NULL)
    {
        if (sound.stream.buffer->voiceId > 0)
        {
            raylib_host_audio_stop(sound.stream.buffer->voiceId);
            sound.stream.buffer->voiceId = 0;
        }
        if (sound.stream.buffer->bufferId > 0)
        {
            raylib_host_audio_destroy_buffer(sound.stream.buffer->bufferId);
            sound.stream.buffer->bufferId = 0;
        }
        UntrackAudioBuffer(sound.stream.buffer);
        RL_FREE(sound.stream.buffer);
    }
}

void UnloadSoundAlias(Sound alias)
{
    if (alias.stream.buffer != NULL)
    {
        if (alias.stream.buffer->voiceId > 0)
        {
            raylib_host_audio_stop(alias.stream.buffer->voiceId);
            alias.stream.buffer->voiceId = 0;
        }
        // Do not destroy shared bufferId on alias unload
        UntrackAudioBuffer(alias.stream.buffer);
        RL_FREE(alias.stream.buffer);
    }
}

void PlaySound(Sound sound)
{
    if (!IsSoundValid(sound)) return;
    rAudioBuffer *buf = sound.stream.buffer;
    buf->voiceId = raylib_host_audio_play(buf->bufferId, buf->volume, buf->pitch, buf->pan, 0);
    buf->playing = true;
    buf->paused = false;
}

void StopSound(Sound sound)
{
    if (!IsSoundValid(sound)) return;
    rAudioBuffer *buf = sound.stream.buffer;
    if (buf->voiceId > 0)
    {
        raylib_host_audio_stop(buf->voiceId);
        buf->voiceId = 0;
    }
    buf->playing = false;
    buf->paused = false;
}

void PauseSound(Sound sound)
{
    if (!IsSoundValid(sound)) return;
    rAudioBuffer *buf = sound.stream.buffer;
    if (buf->voiceId > 0 && buf->playing)
    {
        raylib_host_audio_pause(buf->voiceId);
        buf->paused = true;
        buf->playing = false;
    }
}

void ResumeSound(Sound sound)
{
    if (!IsSoundValid(sound)) return;
    rAudioBuffer *buf = sound.stream.buffer;
    if (buf->voiceId > 0 && buf->paused)
    {
        raylib_host_audio_resume(buf->voiceId);
        buf->paused = false;
        buf->playing = true;
    }
}

bool IsSoundPlaying(Sound sound)
{
    if (!IsSoundValid(sound)) return false;
    rAudioBuffer *buf = sound.stream.buffer;
    if (buf->voiceId <= 0) return false;
    return (raylib_host_audio_is_playing(buf->voiceId) != 0);
}

void SetSoundVolume(Sound sound, float volume)
{
    if (!IsSoundValid(sound)) return;
    rAudioBuffer *buf = sound.stream.buffer;
    buf->volume = (volume < 0.0f) ? 0.0f : volume;
    if (buf->voiceId > 0)
    {
        raylib_host_audio_set_volume(buf->voiceId, buf->volume);
    }
}

void SetSoundPitch(Sound sound, float pitch)
{
    if (!IsSoundValid(sound)) return;
    rAudioBuffer *buf = sound.stream.buffer;
    buf->pitch = (pitch < 0.01f) ? 0.01f : pitch;
    if (buf->voiceId > 0)
    {
        raylib_host_audio_set_pitch(buf->voiceId, buf->pitch);
    }
}

void SetSoundPan(Sound sound, float pan)
{
    if (!IsSoundValid(sound)) return;
    rAudioBuffer *buf = sound.stream.buffer;
    buf->pan = (pan < 0.0f) ? 0.0f : ((pan > 1.0f) ? 1.0f : pan);
    if (buf->voiceId > 0)
    {
        raylib_host_audio_set_pan(buf->voiceId, buf->pan);
    }
}

// ==================================================================================
// AudioStream Functions
// ==================================================================================

AudioStream LoadAudioStream(unsigned int sampleRate, unsigned int sampleSize, unsigned int channels)
{
    AudioStream stream = { 0 };
    stream.sampleRate = sampleRate;
    stream.sampleSize = sampleSize;
    stream.channels = channels;

    int streamId = raylib_host_audio_stream_init((int)channels, (int)sampleRate, (int)sampleSize);
    if (streamId <= 0)
    {
        TRACELOG(LOG_WARNING, "STREAM: Failed to initialize host audio stream");
        return stream;
    }

    rAudioBuffer *audioBuffer = (rAudioBuffer *)RL_CALLOC(1, sizeof(rAudioBuffer));
    audioBuffer->streamId = streamId;
    audioBuffer->volume = 1.0f;
    audioBuffer->pitch = 1.0f;
    audioBuffer->pan = 0.5f;
    audioBuffer->usage = 1; // STREAM

    TrackAudioBuffer(audioBuffer);
    stream.buffer = audioBuffer;

    return stream;
}

bool IsAudioStreamValid(AudioStream stream)
{
    return (stream.buffer != NULL) && (stream.buffer->streamId > 0);
}

void UnloadAudioStream(AudioStream stream)
{
    if (stream.buffer != NULL)
    {
        if (stream.buffer->streamId > 0)
        {
            raylib_host_audio_stream_destroy(stream.buffer->streamId);
            stream.buffer->streamId = 0;
        }
        UntrackAudioBuffer(stream.buffer);
        RL_FREE(stream.buffer);
    }
}

void UpdateAudioStream(AudioStream stream, const void *data, int frameCount)
{
    if (IsAudioStreamValid(stream) && data && frameCount > 0)
    {
        raylib_host_audio_stream_feed(stream.buffer->streamId, data, frameCount);
    }
}

bool IsAudioStreamProcessed(AudioStream stream)
{
    // In our Web Audio queue architecture, the stream accepts frames on demand
    return IsAudioStreamValid(stream);
}

void PlayAudioStream(AudioStream stream)
{
    if (!IsAudioStreamValid(stream)) return;
    raylib_host_audio_stream_play(stream.buffer->streamId);
    stream.buffer->playing = true;
    stream.buffer->paused = false;
}

void PauseAudioStream(AudioStream stream)
{
    if (!IsAudioStreamValid(stream)) return;
    raylib_host_audio_stream_pause(stream.buffer->streamId);
    stream.buffer->paused = true;
    stream.buffer->playing = false;
}

void ResumeAudioStream(AudioStream stream)
{
    if (!IsAudioStreamValid(stream)) return;
    raylib_host_audio_stream_resume(stream.buffer->streamId);
    stream.buffer->paused = false;
    stream.buffer->playing = true;
}

bool IsAudioStreamPlaying(AudioStream stream)
{
    if (!IsAudioStreamValid(stream)) return false;
    return (raylib_host_audio_stream_is_playing(stream.buffer->streamId) != 0);
}

void StopAudioStream(AudioStream stream)
{
    if (!IsAudioStreamValid(stream)) return;
    raylib_host_audio_stream_stop(stream.buffer->streamId);
    stream.buffer->playing = false;
    stream.buffer->paused = false;
}

void SetAudioStreamVolume(AudioStream stream, float volume)
{
    if (!IsAudioStreamValid(stream)) return;
    stream.buffer->volume = (volume < 0.0f) ? 0.0f : volume;
    raylib_host_audio_stream_set_volume(stream.buffer->streamId, stream.buffer->volume);
}

void SetAudioStreamPitch(AudioStream stream, float pitch)
{
    if (!IsAudioStreamValid(stream)) return;
    stream.buffer->pitch = (pitch < 0.01f) ? 0.01f : pitch;
    raylib_host_audio_stream_set_pitch(stream.buffer->streamId, stream.buffer->pitch);
}

void SetAudioStreamPan(AudioStream stream, float pan)
{
    if (!IsAudioStreamValid(stream)) return;
    stream.buffer->pan = (pan < 0.0f) ? 0.0f : ((pan > 1.0f) ? 1.0f : pan);
    raylib_host_audio_stream_set_pan(stream.buffer->streamId, stream.buffer->pan);
}

void SetAudioStreamBufferSizeDefault(int size)
{
    AUDIO.Buffer.defaultSize = size;
}

void SetAudioStreamCallback(AudioStream stream, AudioCallback callback)
{
    if (stream.buffer != NULL) stream.buffer->callback = callback;
}

void AttachAudioStreamProcessor(AudioStream stream, AudioCallback process)
{
    if (!stream.buffer) return;
    rAudioProcessor *proc = (rAudioProcessor *)RL_CALLOC(1, sizeof(rAudioProcessor));
    proc->process = process;

    rAudioProcessor *last = stream.buffer->processor;
    while (last && last->next) last = last->next;
    if (last)
    {
        proc->prev = last;
        last->next = proc;
    }
    else stream.buffer->processor = proc;
}

void DetachAudioStreamProcessor(AudioStream stream, AudioCallback process)
{
    if (!stream.buffer) return;
    rAudioProcessor *p = stream.buffer->processor;
    while (p)
    {
        if (p->process == process)
        {
            if (p->prev) p->prev->next = p->next;
            else stream.buffer->processor = p->next;
            if (p->next) p->next->prev = p->prev;
            RL_FREE(p);
            break;
        }
        p = p->next;
    }
}

void AttachAudioMixedProcessor(AudioCallback process)
{
    rAudioProcessor *proc = (rAudioProcessor *)RL_CALLOC(1, sizeof(rAudioProcessor));
    proc->process = process;
    proc->next = AUDIO.mixedProcessor;
    AUDIO.mixedProcessor = proc;
}

void DetachAudioMixedProcessor(AudioCallback process)
{
    rAudioProcessor *p = AUDIO.mixedProcessor;
    rAudioProcessor *prev = NULL;
    while (p)
    {
        if (p->process == process)
        {
            if (prev) prev->next = p->next;
            else AUDIO.mixedProcessor = p->next;
            RL_FREE(p);
            break;
        }
        prev = p;
        p = p->next;
    }
}

// ==================================================================================
// Music Loading & Streaming Functions
// ==================================================================================

Music LoadMusicStream(const char *fileName)
{
    Music music = { 0 };
    int dataSize = 0;
    unsigned char *fileData = LoadFileData(fileName, &dataSize);
    if (!fileData) return music;

    music = LoadMusicStreamFromMemory(GetFileExtension(fileName), fileData, dataSize);
    UnloadFileData(fileData);
    return music;
}

Music LoadMusicStreamFromMemory(const char *fileType, const unsigned char *data, int dataSize)
{
    Music music = { 0 };
    if (!data || dataSize <= 0) return music;

#if defined(SUPPORT_FILEFORMAT_WAV)
    if (IsFileExtension(fileType, ".wav"))
    {
        drwav *ctxWav = (drwav *)RL_CALLOC(1, sizeof(drwav));
        if (drwav_init_memory(ctxWav, data, dataSize, NULL))
        {
            music.ctxType = MUSIC_AUDIO_WAV;
            music.ctxData = ctxWav;
            music.stream = LoadAudioStream(ctxWav->sampleRate, 16, ctxWav->channels);
            music.frameCount = (unsigned int)ctxWav->totalPCMFrameCount;
            music.looping = true;
            return music;
        }
        RL_FREE(ctxWav);
    }
#endif

#if defined(SUPPORT_FILEFORMAT_OGG)
    if (IsFileExtension(fileType, ".ogg"))
    {
        stb_vorbis *ctxOgg = stb_vorbis_open_memory(data, dataSize, NULL, NULL);
        if (ctxOgg)
        {
            stb_vorbis_info info = stb_vorbis_get_info(ctxOgg);
            music.ctxType = MUSIC_AUDIO_OGG;
            music.ctxData = ctxOgg;
            music.stream = LoadAudioStream(info.sample_rate, 16, info.channels);
            music.frameCount = (unsigned int)stb_vorbis_stream_length_in_samples(ctxOgg);
            music.looping = true;
            return music;
        }
    }
#endif

#if defined(SUPPORT_FILEFORMAT_MP3)
    if (IsFileExtension(fileType, ".mp3"))
    {
        drmp3 *ctxMp3 = (drmp3 *)RL_CALLOC(1, sizeof(drmp3));
        if (drmp3_init_memory(ctxMp3, data, dataSize, NULL))
        {
            music.ctxType = MUSIC_AUDIO_MP3;
            music.ctxData = ctxMp3;
            music.stream = LoadAudioStream(ctxMp3->sampleRate, 32, ctxMp3->channels);
            music.frameCount = (unsigned int)drmp3_get_pcm_frame_count(ctxMp3);
            music.looping = true;
            return music;
        }
        RL_FREE(ctxMp3);
    }
#endif

    TRACELOG(LOG_WARNING, "MUSIC: Stream format not supported");
    return music;
}

bool IsMusicValid(Music music)
{
    return (music.ctxData != NULL) && (music.frameCount > 0) && IsAudioStreamValid(music.stream);
}

void UnloadMusicStream(Music music)
{
    UnloadAudioStream(music.stream);

    if (music.ctxData != NULL)
    {
#if defined(SUPPORT_FILEFORMAT_WAV)
        if (music.ctxType == MUSIC_AUDIO_WAV) { drwav_uninit((drwav *)music.ctxData); RL_FREE(music.ctxData); }
#endif
#if defined(SUPPORT_FILEFORMAT_OGG)
        if (music.ctxType == MUSIC_AUDIO_OGG) stb_vorbis_close((stb_vorbis *)music.ctxData);
#endif
#if defined(SUPPORT_FILEFORMAT_MP3)
        if (music.ctxType == MUSIC_AUDIO_MP3) { drmp3_uninit((drmp3 *)music.ctxData); RL_FREE(music.ctxData); }
#endif
    }
}

void PlayMusicStream(Music music)
{
    PlayAudioStream(music.stream);
}

void PauseMusicStream(Music music)
{
    PauseAudioStream(music.stream);
}

void ResumeMusicStream(Music music)
{
    ResumeAudioStream(music.stream);
}

void StopMusicStream(Music music)
{
    StopAudioStream(music.stream);

    if (music.ctxData != NULL)
    {
#if defined(SUPPORT_FILEFORMAT_WAV)
        if (music.ctxType == MUSIC_AUDIO_WAV) drwav_seek_to_first_pcm_frame((drwav *)music.ctxData);
#endif
#if defined(SUPPORT_FILEFORMAT_OGG)
        if (music.ctxType == MUSIC_AUDIO_OGG) stb_vorbis_seek_start((stb_vorbis *)music.ctxData);
#endif
#if defined(SUPPORT_FILEFORMAT_MP3)
        if (music.ctxType == MUSIC_AUDIO_MP3) drmp3_seek_to_start_of_stream((drmp3 *)music.ctxData);
#endif
    }
}

bool IsMusicStreamPlaying(Music music)
{
    return IsAudioStreamPlaying(music.stream);
}

void UpdateMusicStream(Music music)
{
    if (!IsMusicValid(music) || !IsMusicStreamPlaying(music)) return;

    const int CHUNK_FRAMES = 2048;
    int framesRead = 0;

    switch (music.ctxType)
    {
#if defined(SUPPORT_FILEFORMAT_WAV)
        case MUSIC_AUDIO_WAV:
        {
            drwav *wav = (drwav *)music.ctxData;
            framesRead = (int)drwav_read_pcm_frames_s16(wav, CHUNK_FRAMES, (drwav_int16 *)AUDIO.System.pcmBuffer);
            if (framesRead < CHUNK_FRAMES && music.looping)
            {
                drwav_seek_to_first_pcm_frame(wav);
                int additional = (int)drwav_read_pcm_frames_s16(
                    wav,
                    CHUNK_FRAMES - framesRead,
                    (drwav_int16 *)AUDIO.System.pcmBuffer + (framesRead * music.stream.channels)
                );
                framesRead += additional;
            }
        } break;
#endif

#if defined(SUPPORT_FILEFORMAT_OGG)
        case MUSIC_AUDIO_OGG:
        {
            stb_vorbis *ogg = (stb_vorbis *)music.ctxData;
            framesRead = stb_vorbis_get_samples_short_interleaved(
                ogg,
                music.stream.channels,
                (short *)AUDIO.System.pcmBuffer,
                CHUNK_FRAMES * music.stream.channels
            );
            if (framesRead < CHUNK_FRAMES && music.looping)
            {
                stb_vorbis_seek_start(ogg);
                int additional = stb_vorbis_get_samples_short_interleaved(
                    ogg,
                    music.stream.channels,
                    (short *)AUDIO.System.pcmBuffer + (framesRead * music.stream.channels),
                    (CHUNK_FRAMES - framesRead) * music.stream.channels
                );
                framesRead += additional;
            }
        } break;
#endif

#if defined(SUPPORT_FILEFORMAT_MP3)
        case MUSIC_AUDIO_MP3:
        {
            drmp3 *mp3 = (drmp3 *)music.ctxData;
            framesRead = (int)drmp3_read_pcm_frames_f32(mp3, CHUNK_FRAMES, (float *)AUDIO.System.pcmBuffer);
            if (framesRead < CHUNK_FRAMES && music.looping)
            {
                drmp3_seek_to_start_of_stream(mp3);
                int additional = (int)drmp3_read_pcm_frames_f32(
                    mp3,
                    CHUNK_FRAMES - framesRead,
                    (float *)AUDIO.System.pcmBuffer + (framesRead * music.stream.channels)
                );
                framesRead += additional;
            }
        } break;
#endif
        default: break;
    }

    if (framesRead > 0)
    {
        UpdateAudioStream(music.stream, AUDIO.System.pcmBuffer, framesRead);
        if (music.stream.buffer)
        {
            music.stream.buffer->framesProcessed = (music.stream.buffer->framesProcessed + framesRead) % music.frameCount;
        }
    }
}

void SeekMusicStream(Music music, float position)
{
    if (!IsMusicValid(music)) return;
    unsigned int targetFrame = (unsigned int)(position * music.stream.sampleRate);
    if (targetFrame > music.frameCount) targetFrame = music.frameCount;

    switch (music.ctxType)
    {
#if defined(SUPPORT_FILEFORMAT_WAV)
        case MUSIC_AUDIO_WAV: drwav_seek_to_pcm_frame((drwav *)music.ctxData, targetFrame); break;
#endif
#if defined(SUPPORT_FILEFORMAT_OGG)
        case MUSIC_AUDIO_OGG: stb_vorbis_seek_frame((stb_vorbis *)music.ctxData, targetFrame); break;
#endif
#if defined(SUPPORT_FILEFORMAT_MP3)
        case MUSIC_AUDIO_MP3: drmp3_seek_to_pcm_frame((drmp3 *)music.ctxData, targetFrame); break;
#endif
        default: break;
    }
}

void SetMusicVolume(Music music, float volume)
{
    SetAudioStreamVolume(music.stream, volume);
}

void SetMusicPitch(Music music, float pitch)
{
    SetAudioStreamPitch(music.stream, pitch);
}

void SetMusicPan(Music music, float pan)
{
    SetAudioStreamPan(music.stream, pan);
}

float GetMusicTimeLength(Music music)
{
    if (!IsMusicValid(music) || music.stream.sampleRate == 0) return 0.0f;
    return (float)music.frameCount / (float)music.stream.sampleRate;
}

float GetMusicTimePlayed(Music music)
{
    if (!IsMusicValid(music) || music.stream.sampleRate == 0 || !music.stream.buffer) return 0.0f;
    return (float)music.stream.buffer->framesProcessed / (float)music.stream.sampleRate;
}
