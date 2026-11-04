#include "raylib.h"
#include <stdlib.h>
#include <math.h>

int main(void)
{
    const int screenWidth = 800;
    const int screenHeight = 450;

    InitWindow(screenWidth, screenHeight, "raylib [audio] example - sound loading & playback (wasm32-wasi)");
    InitAudioDevice();

    // Generate a procedural synth bell wave
    const int sampleRate = 44100;
    const int frameCount = 44100; // 1 second
    short *samples = (short *)malloc(frameCount * sizeof(short));
    for (int i = 0; i < frameCount; i++)
    {
        float t = (float)i / (float)sampleRate;
        float decay = expf(-3.5f * t);
        float tone = sinf(2.0f * 3.14159265f * 523.25f * t) * 0.7f +  // C5
                     sinf(2.0f * 3.14159265f * 659.25f * t) * 0.3f;   // E5
        samples[i] = (short)(tone * decay * 30000.0f);
    }

    Wave wave = {
        .frameCount = frameCount,
        .sampleRate = sampleRate,
        .sampleSize = 16,
        .channels = 1,
        .data = samples
    };

    Sound sound = LoadSoundFromWave(wave);
    UnloadWave(wave); // Sound holds its own buffer on the host

    float volume = 0.8f;
    float pitch = 1.0f;
    SetSoundVolume(sound, volume);
    SetSoundPitch(sound, pitch);

    SetTargetFPS(60);

    while (!WindowShouldClose())
    {
        // Interactive controls
        if (IsKeyPressed(KEY_SPACE) || IsMouseButtonPressed(MOUSE_BUTTON_LEFT))
        {
            PlaySound(sound);
        }

        if (IsKeyDown(KEY_UP))
        {
            volume += 0.01f;
            if (volume > 1.0f) volume = 1.0f;
            SetSoundVolume(sound, volume);
        }
        else if (IsKeyDown(KEY_DOWN))
        {
            volume -= 0.01f;
            if (volume < 0.0f) volume = 0.0f;
            SetSoundVolume(sound, volume);
        }

        if (IsKeyDown(KEY_RIGHT))
        {
            pitch += 0.01f;
            if (pitch > 2.5f) pitch = 2.5f;
            SetSoundPitch(sound, pitch);
        }
        else if (IsKeyDown(KEY_LEFT))
        {
            pitch -= 0.01f;
            if (pitch < 0.2f) pitch = 0.2f;
            SetSoundPitch(sound, pitch);
        }

        BeginDrawing();
            ClearBackground(RAYWHITE);

            DrawText("raylib-wasi Audio Subsystem (Web Audio API)", 160, 100, 22, DARKBLUE);
            DrawText("Click Canvas or Press SPACE to PLAY Sound", 195, 180, 20, MAROON);

            DrawText(TextFormat("Volume (UP / DOWN): %.2f", volume), 280, 240, 18, DARKGRAY);
            DrawText(TextFormat("Pitch  (LEFT / RIGHT): %.2f", pitch), 280, 270, 18, DARKGRAY);

            if (IsSoundPlaying(sound))
            {
                DrawCircle(400, 340, 25, GREEN);
                DrawText("PLAYING", 370, 332, 14, WHITE);
            }
            else
            {
                DrawCircle(400, 340, 25, LIGHTGRAY);
                DrawText("IDLE", 384, 332, 14, DARKGRAY);
            }
        EndDrawing();
    }

    UnloadSound(sound);
    CloseAudioDevice();
    CloseWindow();

    return 0;
}
