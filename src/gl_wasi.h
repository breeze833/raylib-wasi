#ifndef RAYLIB_WASI_GL_WASI_H
#define RAYLIB_WASI_GL_WASI_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Standard OpenGL ES 2.0 Types */
typedef void GLvoid;
typedef char GLchar;
typedef unsigned int GLenum;
typedef unsigned char GLboolean;
typedef unsigned int GLbitfield;
typedef signed char GLbyte;
typedef short GLshort;
typedef int GLint;
typedef int GLsizei;
typedef unsigned char GLubyte;
typedef unsigned short GLushort;
typedef unsigned int GLuint;
typedef float GLfloat;
typedef float GLclampf;
typedef int GLfixed;
typedef intptr_t GLintptr;
typedef size_t GLsizeiptr;

#define GL_APIENTRY
#define GL_APIENTRYP *
#define GL_APICALL

/* Boolean values */
#define GL_FALSE                          0
#define GL_TRUE                           1

/* Clear buffer bits */
#define GL_DEPTH_BUFFER_BIT               0x00000100
#define GL_STENCIL_BUFFER_BIT             0x00000400
#define GL_COLOR_BUFFER_BIT               0x00004000

/* BeginMode / Primitive types */
#define GL_POINTS                         0x0000
#define GL_LINES                          0x0001
#define GL_LINE_LOOP                      0x0002
#define GL_LINE_STRIP                     0x0003
#define GL_TRIANGLES                      0x0004
#define GL_TRIANGLE_STRIP                 0x0005
#define GL_TRIANGLE_FAN                   0x0006

/* Blending / Factor */
#define GL_ZERO                           0
#define GL_ONE                            1
#define GL_SRC_COLOR                      0x0300
#define GL_ONE_MINUS_SRC_COLOR            0x0301
#define GL_SRC_ALPHA                      0x0302
#define GL_ONE_MINUS_SRC_ALPHA            0x0303
#define GL_DST_ALPHA                      0x0304
#define GL_ONE_MINUS_DST_ALPHA            0x0305
#define GL_DST_COLOR                      0x0306
#define GL_ONE_MINUS_DST_COLOR            0x0307
#define GL_SRC_ALPHA_SATURATE             0x0308
#define GL_CONSTANT_COLOR                 0x8001
#define GL_ONE_MINUS_CONSTANT_COLOR       0x8002
#define GL_CONSTANT_ALPHA                 0x8003
#define GL_ONE_MINUS_CONSTANT_ALPHA       0x8004
#define GL_BLEND_COLOR                    0x8005

/* Blend equation */
#define GL_FUNC_ADD                       0x8006
#define GL_BLEND_EQUATION                 0x8009
#define GL_BLEND_EQUATION_RGB             0x8009
#define GL_BLEND_EQUATION_ALPHA           0x883D
#define GL_FUNC_SUBTRACT                  0x800A
#define GL_FUNC_REVERSE_SUBTRACT          0x800B
#define GL_BLEND_DST_RGB                  0x80C8
#define GL_BLEND_SRC_RGB                  0x80C9
#define GL_BLEND_DST_ALPHA                0x80CA
#define GL_BLEND_SRC_ALPHA                0x80CB

/* Enable / Capabilities */
#define GL_CULL_FACE                      0x0B44
#define GL_DEPTH_TEST                     0x0B71
#define GL_STENCIL_TEST                   0x0B90
#define GL_BLEND                          0x0BE2
#define GL_SCISSOR_TEST                   0x0C11
#define GL_TEXTURE_2D                     0x0DE1

/* Depth / Stencil / Compare functions */
#define GL_NEVER                          0x0200
#define GL_LESS                           0x0201
#define GL_EQUAL                          0x0202
#define GL_LEQUAL                         0x0203
#define GL_GREATER                        0x0204
#define GL_NOTEQUAL                       0x0205
#define GL_GEQUAL                         0x0206
#define GL_ALWAYS                         0x0207

/* Front / Back / Face */
#define GL_FRONT                          0x0404
#define GL_BACK                           0x0405
#define GL_FRONT_AND_BACK                 0x0408
#define GL_CW                             0x0900
#define GL_CCW                            0x0901

/* Hints */
#define GL_DONT_CARE                      0x1100
#define GL_FASTEST                        0x1101
#define GL_NICEST                         0x1102
#define GL_GENERATE_MIPMAP_HINT           0x8192

/* Errors */
#define GL_NO_ERROR                       0
#define GL_INVALID_ENUM                   0x0500
#define GL_INVALID_VALUE                  0x0501
#define GL_INVALID_OPERATION              0x0502
#define GL_STACK_OVERFLOW                 0x0503
#define GL_STACK_UNDERFLOW                0x0504
#define GL_OUT_OF_MEMORY                  0x0505
#define GL_INVALID_FRAMEBUFFER_OPERATION  0x0506

/* Data types */
#define GL_BYTE                           0x1400
#define GL_UNSIGNED_BYTE                  0x1401
#define GL_SHORT                          0x1402
#define GL_UNSIGNED_SHORT                 0x1403
#define GL_INT                            0x1404
#define GL_UNSIGNED_INT                   0x1405
#define GL_FLOAT                          0x1406
#define GL_FIXED                          0x140C
#define GL_DOUBLE                         0x140A
#define GL_HALF_FLOAT                     0x140B
#define GL_HALF_FLOAT_OES                 0x8D61
#define GL_HALF_FLOAT_ARB                 0x140B

/* Pixel formats & types */
#define GL_DEPTH_COMPONENT                0x1902
#define GL_RED                            0x1903
#define GL_GREEN                          0x1904
#define GL_BLUE                           0x1905
#define GL_ALPHA                          0x1906
#define GL_RGB                            0x1907
#define GL_RGBA                           0x1908
#define GL_LUMINANCE                      0x1909
#define GL_LUMINANCE_ALPHA                0x190A
#define GL_UNSIGNED_SHORT_4_4_4_4         0x8033
#define GL_UNSIGNED_SHORT_5_5_5_1         0x8034
#define GL_UNSIGNED_SHORT_5_6_5           0x8363

/* String queries */
#define GL_VENDOR                         0x1F00
#define GL_RENDERER                       0x1F01
#define GL_VERSION                        0x1F02
#define GL_EXTENSIONS                     0x1F03
#define GL_SHADING_LANGUAGE_VERSION       0x8B8C

/* Texture wrapping & filtering */
#define GL_TEXTURE_MAG_FILTER             0x2800
#define GL_TEXTURE_MIN_FILTER             0x2801
#define GL_TEXTURE_WRAP_S                 0x2802
#define GL_TEXTURE_WRAP_T                 0x2803
#define GL_TEXTURE_WRAP_R                 0x8072
#define GL_NEAREST                        0x2600
#define GL_LINEAR                         0x2601
#define GL_NEAREST_MIPMAP_NEAREST         0x2700
#define GL_LINEAR_MIPMAP_NEAREST          0x2701
#define GL_NEAREST_MIPMAP_LINEAR          0x2702
#define GL_LINEAR_MIPMAP_LINEAR           0x2703
#define GL_REPEAT                         0x2901
#define GL_CLAMP_TO_EDGE                  0x812F
#define GL_MIRRORED_REPEAT                0x8370
#define GL_TEXTURE0                       0x84C0
#define GL_ACTIVE_TEXTURE                 0x84E0
#define GL_MAX_TEXTURE_SIZE               0x0D33
#define GL_MAX_TEXTURE_IMAGE_UNITS        0x8872
#define GL_MAX_CUBE_MAP_TEXTURE_SIZE      0x851C

/* Cube map */
#define GL_TEXTURE_CUBE_MAP               0x8513
#define GL_TEXTURE_CUBE_MAP_POSITIVE_X    0x8515
#define GL_TEXTURE_CUBE_MAP_NEGATIVE_X    0x8516
#define GL_TEXTURE_CUBE_MAP_POSITIVE_Y    0x8517
#define GL_TEXTURE_CUBE_MAP_NEGATIVE_Y    0x8518
#define GL_TEXTURE_CUBE_MAP_POSITIVE_Z    0x8519
#define GL_TEXTURE_CUBE_MAP_NEGATIVE_Z    0x851A

/* Buffers */
#define GL_ARRAY_BUFFER                   0x8892
#define GL_ELEMENT_ARRAY_BUFFER           0x8893
#define GL_ARRAY_BUFFER_BINDING           0x8894
#define GL_ELEMENT_ARRAY_BUFFER_BINDING   0x8895
#define GL_STREAM_DRAW                    0x88E0
#define GL_STATIC_DRAW                    0x88E4
#define GL_DYNAMIC_DRAW                   0x88E8
#define GL_BUFFER_SIZE                    0x8764
#define GL_BUFFER_USAGE                   0x8765

/* Shaders & Programs */
#define GL_FRAGMENT_SHADER                0x8B30
#define GL_VERTEX_SHADER                  0x8B31
#define GL_MAX_VERTEX_ATTRIBS             0x8869
#define GL_COMPILE_STATUS                 0x8B81
#define GL_LINK_STATUS                    0x8B82
#define GL_VALIDATE_STATUS                0x8B83
#define GL_INFO_LOG_LENGTH                0x8B84
#define GL_ATTACHED_SHADERS               0x8B85
#define GL_ACTIVE_UNIFORMS                0x8B86
#define GL_ACTIVE_UNIFORM_MAX_LENGTH      0x8B87
#define GL_ACTIVE_ATTRIBUTES              0x8B89
#define GL_ACTIVE_ATTRIBUTE_MAX_LENGTH    0x8B8A
#define GL_CURRENT_PROGRAM                0x8B8D

/* Framebuffers & Renderbuffers */
#define GL_FRAMEBUFFER                    0x8D40
#define GL_RENDERBUFFER                   0x8D41
#define GL_FRAMEBUFFER_BINDING            0x8CA6
#define GL_RENDERBUFFER_BINDING           0x8CA7
#define GL_FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE        0x8CD0
#define GL_FRAMEBUFFER_ATTACHMENT_OBJECT_NAME        0x8CD1
#define GL_TEXTURE                                   0x1702
#define GL_COLOR_ATTACHMENT0              0x8CE0
#define GL_COLOR_ATTACHMENT1              0x8CE1
#define GL_COLOR_ATTACHMENT2              0x8CE2
#define GL_COLOR_ATTACHMENT3              0x8CE3
#define GL_COLOR_ATTACHMENT4              0x8CE4
#define GL_COLOR_ATTACHMENT5              0x8CE5
#define GL_COLOR_ATTACHMENT6              0x8CE6
#define GL_COLOR_ATTACHMENT7              0x8CE7
#define GL_DEPTH_ATTACHMENT               0x8D00
#define GL_STENCIL_ATTACHMENT             0x8D20
#define GL_FRAMEBUFFER_COMPLETE                      0x8CD5
#define GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT         0x8CD6
#define GL_FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT 0x8CD7
#define GL_FRAMEBUFFER_INCOMPLETE_DIMENSIONS         0x8CD9
#define GL_FRAMEBUFFER_UNSUPPORTED                   0x8CDD
#define GL_RENDERBUFFER_WIDTH             0x8D42
#define GL_RENDERBUFFER_HEIGHT            0x8D43
#define GL_RENDERBUFFER_INTERNAL_FORMAT   0x8D44
#define GL_MAX_RENDERBUFFER_SIZE          0x84E8
#define GL_DEPTH_COMPONENT16              0x81A5
#define GL_DEPTH_COMPONENT24              0x81A6
#define GL_DEPTH_COMPONENT24_OES          0x81A6
#define GL_DEPTH_COMPONENT32              0x81A7
#define GL_DEPTH_COMPONENT32_OES          0x81A7
#define GL_STENCIL_INDEX8                 0x8D48
#define GL_RGB565                         0x8D62
#define GL_RGBA4                          0x8056
#define GL_RGB5_A1                        0x8057

/* Pixel pack / unpack */
#define GL_UNPACK_ALIGNMENT               0x0CF5
#define GL_PACK_ALIGNMENT                 0x0D05
#define GL_VIEWPORT                       0x0BA2
#define GL_LINE_WIDTH                     0x0B21

/* Extensions & Advanced formats */
#define GL_NUM_EXTENSIONS                 0x821D
#define GL_NUM_COMPRESSED_TEXTURE_FORMATS 0x86A2
#define GL_COMPRESSED_TEXTURE_FORMATS     0x86A3
#define GL_MAX_TEXTURE_MAX_ANISOTROPY_EXT 0x84FF
#define GL_TEXTURE_MAX_ANISOTROPY_EXT     0x84FE
#define GL_RGBA32F                        0x8814
#define GL_RGB32F                         0x8815
#define GL_RGBA16F                        0x881A
#define GL_RGB16F                         0x881B
#define GL_R16F                           0x822D
#define GL_R32F                           0x822E
#define GL_R8                             0x8229
#define GL_RG8                            0x822B

/* Function Pointer Typedefs for Extensions (VAO, Instancing) */
typedef void (GL_APIENTRYP PFNGLGENVERTEXARRAYSOESPROC) (GLsizei n, GLuint *arrays);
typedef void (GL_APIENTRYP PFNGLBINDVERTEXARRAYOESPROC) (GLuint array);
typedef void (GL_APIENTRYP PFNGLDELETEVERTEXARRAYSOESPROC) (GLsizei n, const GLuint *arrays);
typedef GLboolean (GL_APIENTRYP PFNGLISVERTEXARRAYOESPROC) (GLuint array);
typedef void (GL_APIENTRYP PFNGLDRAWARRAYSINSTANCEDEXTPROC) (GLenum mode, GLint start, GLsizei count, GLsizei primcount);
typedef void (GL_APIENTRYP PFNGLDRAWELEMENTSINSTANCEDEXTPROC) (GLenum mode, GLsizei count, GLenum type, const void *indices, GLsizei primcount);
typedef void (GL_APIENTRYP PFNGLVERTEXATTRIBDIVISOREXTPROC) (GLuint index, GLuint divisor);

#define GL_IMPORT(name) __attribute__((import_module("gl"), import_name(#name)))

/* Direct WebGL / OpenGL ES 2.0 Scalar & Buffer Imports */
GL_IMPORT(glActiveTexture) void glActiveTexture(GLenum texture);
GL_IMPORT(glAttachShader) void glAttachShader(GLuint program, GLuint shader);
GL_IMPORT(glBindBuffer) void glBindBuffer(GLenum target, GLuint buffer);
GL_IMPORT(glBindFramebuffer) void glBindFramebuffer(GLenum target, GLuint framebuffer);
GL_IMPORT(glBindRenderbuffer) void glBindRenderbuffer(GLenum target, GLuint renderbuffer);
GL_IMPORT(glBindTexture) void glBindTexture(GLenum target, GLuint texture);
GL_IMPORT(glBlendColor) void glBlendColor(GLclampf red, GLclampf green, GLclampf blue, GLclampf alpha);
GL_IMPORT(glBlendEquation) void glBlendEquation(GLenum mode);
GL_IMPORT(glBlendEquationSeparate) void glBlendEquationSeparate(GLenum modeRGB, GLenum modeAlpha);
GL_IMPORT(glBlendFunc) void glBlendFunc(GLenum sfactor, GLenum dfactor);
GL_IMPORT(glBlendFuncSeparate) void glBlendFuncSeparate(GLenum srcRGB, GLenum dstRGB, GLenum srcAlpha, GLenum dstAlpha);
GL_IMPORT(glBufferData) void glBufferData(GLenum target, GLsizeiptr size, const void *data, GLenum usage);
GL_IMPORT(glBufferSubData) void glBufferSubData(GLenum target, GLintptr offset, GLsizeiptr size, const void *data);
GL_IMPORT(glCheckFramebufferStatus) GLenum glCheckFramebufferStatus(GLenum target);
GL_IMPORT(glClear) void glClear(GLbitfield mask);
GL_IMPORT(glClearColor) void glClearColor(GLclampf red, GLclampf green, GLclampf blue, GLclampf alpha);
GL_IMPORT(glClearDepthf) void glClearDepthf(GLclampf depth);
GL_IMPORT(glClearStencil) void glClearStencil(GLint s);
GL_IMPORT(glColorMask) void glColorMask(GLboolean red, GLboolean green, GLboolean blue, GLboolean alpha);
GL_IMPORT(glCompileShader) void glCompileShader(GLuint shader);
GL_IMPORT(glCompressedTexImage2D) void glCompressedTexImage2D(GLenum target, GLint level, GLenum internalformat, GLsizei width, GLsizei height, GLint border, GLsizei imageSize, const void *data);
GL_IMPORT(glCompressedTexSubImage2D) void glCompressedTexSubImage2D(GLenum target, GLint level, GLint xoffset, GLint yoffset, GLsizei width, GLsizei height, GLenum format, GLsizei imageSize, const void *data);
GL_IMPORT(glCopyTexImage2D) void glCopyTexImage2D(GLenum target, GLint level, GLenum internalformat, GLint x, GLint y, GLsizei width, GLsizei height, GLint border);
GL_IMPORT(glCopyTexSubImage2D) void glCopyTexSubImage2D(GLenum target, GLint level, GLint xoffset, GLint yoffset, GLint x, GLint y, GLsizei width, GLsizei height);
GL_IMPORT(glCreateProgram) GLuint glCreateProgram(void);
GL_IMPORT(glCreateShader) GLuint glCreateShader(GLenum type);
GL_IMPORT(glCullFace) void glCullFace(GLenum mode);
GL_IMPORT(glDeleteBuffers) void glDeleteBuffers(GLsizei n, const GLuint *buffers);
GL_IMPORT(glDeleteFramebuffers) void glDeleteFramebuffers(GLsizei n, const GLuint *framebuffers);
GL_IMPORT(glDeleteProgram) void glDeleteProgram(GLuint program);
GL_IMPORT(glDeleteRenderbuffers) void glDeleteRenderbuffers(GLsizei n, const GLuint *renderbuffers);
GL_IMPORT(glDeleteShader) void glDeleteShader(GLuint shader);
GL_IMPORT(glDeleteTextures) void glDeleteTextures(GLsizei n, const GLuint *textures);
GL_IMPORT(glDepthFunc) void glDepthFunc(GLenum func);
GL_IMPORT(glDepthMask) void glDepthMask(GLboolean flag);
GL_IMPORT(glDepthRangef) void glDepthRangef(GLclampf zNear, GLclampf zFar);
GL_IMPORT(glDetachShader) void glDetachShader(GLuint program, GLuint shader);
GL_IMPORT(glDisable) void glDisable(GLenum cap);
GL_IMPORT(glDisableVertexAttribArray) void glDisableVertexAttribArray(GLuint index);
GL_IMPORT(glDrawArrays) void glDrawArrays(GLenum mode, GLint first, GLsizei count);
GL_IMPORT(glDrawElements) void glDrawElements(GLenum mode, GLsizei count, GLenum type, const void *indices);
GL_IMPORT(glEnable) void glEnable(GLenum cap);
GL_IMPORT(glEnableVertexAttribArray) void glEnableVertexAttribArray(GLuint index);
GL_IMPORT(glFinish) void glFinish(void);
GL_IMPORT(glFlush) void glFlush(void);
GL_IMPORT(glFramebufferRenderbuffer) void glFramebufferRenderbuffer(GLenum target, GLenum attachment, GLenum renderbuffertarget, GLuint renderbuffer);
GL_IMPORT(glFramebufferTexture2D) void glFramebufferTexture2D(GLenum target, GLenum attachment, GLenum textarget, GLuint texture, GLint level);
GL_IMPORT(glFrontFace) void glFrontFace(GLenum mode);
GL_IMPORT(glGenBuffers) void glGenBuffers(GLsizei n, GLuint *buffers);
GL_IMPORT(glGenerateMipmap) void glGenerateMipmap(GLenum target);
GL_IMPORT(glGenFramebuffers) void glGenFramebuffers(GLsizei n, GLuint *framebuffers);
GL_IMPORT(glGenRenderbuffers) void glGenRenderbuffers(GLsizei n, GLuint *renderbuffers);
GL_IMPORT(glGenTextures) void glGenTextures(GLsizei n, GLuint *textures);
GL_IMPORT(glGetActiveAttrib) void glGetActiveAttrib(GLuint program, GLuint index, GLsizei bufsize, GLsizei *length, GLint *size, GLenum *type, GLchar *name);
GL_IMPORT(glGetActiveUniform) void glGetActiveUniform(GLuint program, GLuint index, GLsizei bufsize, GLsizei *length, GLint *size, GLenum *type, GLchar *name);
GL_IMPORT(glGetAttachedShaders) void glGetAttachedShaders(GLuint program, GLsizei maxcount, GLsizei *count, GLuint *shaders);
GL_IMPORT(glGetBooleanv) void glGetBooleanv(GLenum pname, GLboolean *params);
GL_IMPORT(glGetBufferParameteriv) void glGetBufferParameteriv(GLenum target, GLenum pname, GLint *params);
GL_IMPORT(glGetError) GLenum glGetError(void);
GL_IMPORT(glGetFloatv) void glGetFloatv(GLenum pname, GLfloat *params);
GL_IMPORT(glGetFramebufferAttachmentParameteriv) void glGetFramebufferAttachmentParameteriv(GLenum target, GLenum attachment, GLenum pname, GLint *params);
GL_IMPORT(glGetIntegerv) void glGetIntegerv(GLenum pname, GLint *params);
GL_IMPORT(glGetProgramiv) void glGetProgramiv(GLuint program, GLenum pname, GLint *params);
GL_IMPORT(glGetRenderbufferParameteriv) void glGetRenderbufferParameteriv(GLenum target, GLenum pname, GLint *params);
GL_IMPORT(glGetShaderiv) void glGetShaderiv(GLuint shader, GLenum pname, GLint *params);
GL_IMPORT(glGetShaderPrecisionFormat) void glGetShaderPrecisionFormat(GLenum shadertype, GLenum precisiontype, GLint *range, GLint *precision);
GL_IMPORT(glGetShaderSource) void glGetShaderSource(GLuint shader, GLsizei bufsize, GLsizei *length, GLchar *source);
GL_IMPORT(glGetTexParameterfv) void glGetTexParameterfv(GLenum target, GLenum pname, GLfloat *params);
GL_IMPORT(glGetTexParameteriv) void glGetTexParameteriv(GLenum target, GLenum pname, GLint *params);
GL_IMPORT(glGetUniformfv) void glGetUniformfv(GLuint program, GLint location, GLfloat *params);
GL_IMPORT(glGetUniformiv) void glGetUniformiv(GLuint program, GLint location, GLint *params);
GL_IMPORT(glGetVertexAttribfv) void glGetVertexAttribfv(GLuint index, GLenum pname, GLfloat *params);
GL_IMPORT(glGetVertexAttribiv) void glGetVertexAttribiv(GLuint index, GLenum pname, GLint *params);
GL_IMPORT(glGetVertexAttribPointerv) void glGetVertexAttribPointerv(GLuint index, GLenum pname, void **pointer);
GL_IMPORT(glHint) void glHint(GLenum target, GLenum mode);
GL_IMPORT(glIsBuffer) GLboolean glIsBuffer(GLuint buffer);
GL_IMPORT(glIsEnabled) GLboolean glIsEnabled(GLenum cap);
GL_IMPORT(glIsFramebuffer) GLboolean glIsFramebuffer(GLuint framebuffer);
GL_IMPORT(glIsProgram) GLboolean glIsProgram(GLuint program);
GL_IMPORT(glIsRenderbuffer) GLboolean glIsRenderbuffer(GLuint renderbuffer);
GL_IMPORT(glIsShader) GLboolean glIsShader(GLuint shader);
GL_IMPORT(glIsTexture) GLboolean glIsTexture(GLuint texture);
GL_IMPORT(glLineWidth) void glLineWidth(GLfloat width);
GL_IMPORT(glLinkProgram) void glLinkProgram(GLuint program);
GL_IMPORT(glPixelStorei) void glPixelStorei(GLenum pname, GLint param);
GL_IMPORT(glPolygonOffset) void glPolygonOffset(GLfloat factor, GLfloat units);
GL_IMPORT(glReadPixels) void glReadPixels(GLint x, GLint y, GLsizei width, GLsizei height, GLenum format, GLenum type, void *pixels);
GL_IMPORT(glRenderbufferStorage) void glRenderbufferStorage(GLenum target, GLenum internalformat, GLsizei width, GLsizei height);
GL_IMPORT(glSampleCoverage) void glSampleCoverage(GLclampf value, GLboolean invert);
GL_IMPORT(glScissor) void glScissor(GLint x, GLint y, GLsizei width, GLsizei height);
GL_IMPORT(glStencilFunc) void glStencilFunc(GLenum func, GLint ref, GLuint mask);
GL_IMPORT(glStencilFuncSeparate) void glStencilFuncSeparate(GLenum face, GLenum func, GLint ref, GLuint mask);
GL_IMPORT(glStencilMask) void glStencilMask(GLuint mask);
GL_IMPORT(glStencilMaskSeparate) void glStencilMaskSeparate(GLenum face, GLuint mask);
GL_IMPORT(glStencilOp) void glStencilOp(GLenum fail, GLenum zfail, GLenum zpass);
GL_IMPORT(glStencilOpSeparate) void glStencilOpSeparate(GLenum face, GLenum fail, GLenum zfail, GLenum zpass);
GL_IMPORT(glTexImage2D) void glTexImage2D(GLenum target, GLint level, GLint internalformat, GLsizei width, GLsizei height, GLint border, GLenum format, GLenum type, const void *pixels);
GL_IMPORT(glTexParameterf) void glTexParameterf(GLenum target, GLenum pname, GLfloat param);
GL_IMPORT(glTexParameterfv) void glTexParameterfv(GLenum target, GLenum pname, const GLfloat *params);
GL_IMPORT(glTexParameteri) void glTexParameteri(GLenum target, GLenum pname, GLint param);
GL_IMPORT(glTexParameteriv) void glTexParameteriv(GLenum target, GLenum pname, const GLint *params);
GL_IMPORT(glTexSubImage2D) void glTexSubImage2D(GLenum target, GLint level, GLint xoffset, GLint yoffset, GLsizei width, GLsizei height, GLenum format, GLenum type, const void *pixels);
GL_IMPORT(glUniform1f) void glUniform1f(GLint location, GLfloat x);
GL_IMPORT(glUniform1fv) void glUniform1fv(GLint location, GLsizei count, const GLfloat *v);
GL_IMPORT(glUniform1i) void glUniform1i(GLint location, GLint x);
GL_IMPORT(glUniform1iv) void glUniform1iv(GLint location, GLsizei count, const GLint *v);
GL_IMPORT(glUniform2f) void glUniform2f(GLint location, GLfloat x, GLfloat y);
GL_IMPORT(glUniform2fv) void glUniform2fv(GLint location, GLsizei count, const GLfloat *v);
GL_IMPORT(glUniform2i) void glUniform2i(GLint location, GLint x, GLint y);
GL_IMPORT(glUniform2iv) void glUniform2iv(GLint location, GLsizei count, const GLint *v);
GL_IMPORT(glUniform3f) void glUniform3f(GLint location, GLfloat x, GLfloat y, GLfloat z);
GL_IMPORT(glUniform3fv) void glUniform3fv(GLint location, GLsizei count, const GLfloat *v);
GL_IMPORT(glUniform3i) void glUniform3i(GLint location, GLint x, GLint y, GLint z);
GL_IMPORT(glUniform3iv) void glUniform3iv(GLint location, GLsizei count, const GLint *v);
GL_IMPORT(glUniform4f) void glUniform4f(GLint location, GLfloat x, GLfloat y, GLfloat z, GLfloat w);
GL_IMPORT(glUniform4fv) void glUniform4fv(GLint location, GLsizei count, const GLfloat *v);
GL_IMPORT(glUniform4i) void glUniform4i(GLint location, GLint x, GLint y, GLint z, GLint w);
GL_IMPORT(glUniform4iv) void glUniform4iv(GLint location, GLsizei count, const GLint *v);
GL_IMPORT(glUniformMatrix2fv) void glUniformMatrix2fv(GLint location, GLsizei count, GLboolean transpose, const GLfloat *value);
GL_IMPORT(glUniformMatrix3fv) void glUniformMatrix3fv(GLint location, GLsizei count, GLboolean transpose, const GLfloat *value);
GL_IMPORT(glUniformMatrix4fv) void glUniformMatrix4fv(GLint location, GLsizei count, GLboolean transpose, const GLfloat *value);
GL_IMPORT(glUseProgram) void glUseProgram(GLuint program);
GL_IMPORT(glValidateProgram) void glValidateProgram(GLuint program);
GL_IMPORT(glVertexAttrib1f) void glVertexAttrib1f(GLuint indx, GLfloat x);
GL_IMPORT(glVertexAttrib1fv) void glVertexAttrib1fv(GLuint indx, const GLfloat *values);
GL_IMPORT(glVertexAttrib2f) void glVertexAttrib2f(GLuint indx, GLfloat x, GLfloat y);
GL_IMPORT(glVertexAttrib2fv) void glVertexAttrib2fv(GLuint indx, const GLfloat *values);
GL_IMPORT(glVertexAttrib3f) void glVertexAttrib3f(GLuint indx, GLfloat x, GLfloat y, GLfloat z);
GL_IMPORT(glVertexAttrib3fv) void glVertexAttrib3fv(GLuint indx, const GLfloat *values);
GL_IMPORT(glVertexAttrib4f) void glVertexAttrib4f(GLuint indx, GLfloat x, GLfloat y, GLfloat z, GLfloat w);
GL_IMPORT(glVertexAttrib4fv) void glVertexAttrib4fv(GLuint indx, const GLfloat *values);
GL_IMPORT(glVertexAttribPointer) void glVertexAttribPointer(GLuint indx, GLint size, GLenum type, GLboolean normalized, GLsizei stride, const void *ptr);
GL_IMPORT(glViewport) void glViewport(GLint x, GLint y, GLsizei width, GLsizei height);

/* C Wrappers defined in src/gl_wasi.c (for String & Pointer Marshalling) */
const GLubyte *glGetString(GLenum name);
void glShaderSource(GLuint shader, GLsizei count, const GLchar *const *string, const GLint *length);
void glGetShaderInfoLog(GLuint shader, GLsizei maxLength, GLsizei *length, GLchar *infoLog);
void glGetProgramInfoLog(GLuint program, GLsizei maxLength, GLsizei *length, GLchar *infoLog);
GLint glGetUniformLocation(GLuint program, const GLchar *name);
GLint glGetAttribLocation(GLuint program, const GLchar *name);
void glBindAttribLocation(GLuint program, GLuint index, const GLchar *name);

#undef GL_IMPORT

#ifdef __cplusplus
}
#endif

#endif // RAYLIB_WASI_GL_WASI_H
