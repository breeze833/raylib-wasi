#include "gl_wasi.h"
#include <stdlib.h>
#include <string.h>

#define GL_HOST_IMPORT(name) __attribute__((import_module("gl"), import_name(#name)))

/* Raw host import functions for string/pointer marshalling */
GL_HOST_IMPORT(gl_host_get_string)
int gl_host_get_string(GLenum name, char *buffer, int max_size);

GL_HOST_IMPORT(gl_host_shader_source)
void gl_host_shader_source(GLuint shader, const char *source, int length);

GL_HOST_IMPORT(gl_host_get_shader_info_log)
void gl_host_get_shader_info_log(GLuint shader, GLsizei maxLength, GLsizei *length, GLchar *infoLog);

GL_HOST_IMPORT(gl_host_get_program_info_log)
void gl_host_get_program_info_log(GLuint program, GLsizei maxLength, GLsizei *length, GLchar *infoLog);

GL_HOST_IMPORT(gl_host_get_uniform_location)
GLint gl_host_get_uniform_location(GLuint program, const GLchar *name, int nameLen);

GL_HOST_IMPORT(gl_host_get_attrib_location)
GLint gl_host_get_attrib_location(GLuint program, const GLchar *name, int nameLen);

GL_HOST_IMPORT(gl_host_bind_attrib_location)
void gl_host_bind_attrib_location(GLuint program, GLuint index, const GLchar *name, int nameLen);

/* C Wrappers implementation */

const GLubyte *glGetString(GLenum name)
{
    static char s_vendor[128] = { 0 };
    static char s_renderer[128] = { 0 };
    static char s_version[128] = { 0 };
    static char s_extensions[8192] = { 0 };
    static char s_sl_version[128] = { 0 };

    switch (name)
    {
        case GL_VENDOR:
            if (!s_vendor[0]) gl_host_get_string(GL_VENDOR, s_vendor, (int)sizeof(s_vendor));
            return (const GLubyte *)s_vendor;
        case GL_RENDERER:
            if (!s_renderer[0]) gl_host_get_string(GL_RENDERER, s_renderer, (int)sizeof(s_renderer));
            return (const GLubyte *)s_renderer;
        case GL_VERSION:
            if (!s_version[0]) gl_host_get_string(GL_VERSION, s_version, (int)sizeof(s_version));
            return (const GLubyte *)s_version;
        case GL_SHADING_LANGUAGE_VERSION:
            if (!s_sl_version[0]) gl_host_get_string(GL_SHADING_LANGUAGE_VERSION, s_sl_version, (int)sizeof(s_sl_version));
            return (const GLubyte *)s_sl_version;
        case GL_EXTENSIONS:
            if (!s_extensions[0]) gl_host_get_string(GL_EXTENSIONS, s_extensions, (int)sizeof(s_extensions));
            return (const GLubyte *)s_extensions;
        default:
            return (const GLubyte *)"";
    }
}

void glShaderSource(GLuint shader, GLsizei count, const GLchar *const *string, const GLint *length)
{
    if (count <= 0 || !string) return;

    if (count == 1)
    {
        int len = (length && length[0] >= 0) ? length[0] : (int)strlen(string[0]);
        gl_host_shader_source(shader, string[0], len);
        return;
    }

    // Multiple strings: compute combined size and concatenate
    size_t total_length = 0;
    for (GLsizei i = 0; i < count; i++)
    {
        if (string[i])
        {
            size_t part_len = (length && length[i] >= 0) ? (size_t)length[i] : strlen(string[i]);
            total_length += part_len;
        }
    }

    char *combined = (char *)malloc(total_length + 1);
    if (!combined) return;

    size_t offset = 0;
    for (GLsizei i = 0; i < count; i++)
    {
        if (string[i])
        {
            size_t part_len = (length && length[i] >= 0) ? (size_t)length[i] : strlen(string[i]);
            memcpy(combined + offset, string[i], part_len);
            offset += part_len;
        }
    }
    combined[offset] = '\0';

    gl_host_shader_source(shader, combined, (int)offset);
    free(combined);
}

void glGetShaderInfoLog(GLuint shader, GLsizei maxLength, GLsizei *length, GLchar *infoLog)
{
    gl_host_get_shader_info_log(shader, maxLength, length, infoLog);
}

void glGetProgramInfoLog(GLuint program, GLsizei maxLength, GLsizei *length, GLchar *infoLog)
{
    gl_host_get_program_info_log(program, maxLength, length, infoLog);
}

GLint glGetUniformLocation(GLuint program, const GLchar *name)
{
    if (!name) return -1;
    return gl_host_get_uniform_location(program, name, (int)strlen(name));
}

GLint glGetAttribLocation(GLuint program, const GLchar *name)
{
    if (!name) return -1;
    return gl_host_get_attrib_location(program, name, (int)strlen(name));
}

void glBindAttribLocation(GLuint program, GLuint index, const GLchar *name)
{
    if (!name) return;
    gl_host_bind_attrib_location(program, index, name, (int)strlen(name));
}
