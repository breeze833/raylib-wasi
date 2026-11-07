/**
 * raylib-wasi Standalone Host Runtime Bridge
 * Zero-dependency vanilla ES module for WebGL, input sync & WASI execution
 * https://github.com/breeze833/raylib-wasi
 */

// gl-context.js - WebGL ES 2.0 Host State Machine and Handle Table

function createGLImports(gl, getMemory) {
  const buffers = new Map();
  const textures = new Map();
  const shaders = new Map();
  const programs = new Map();
  const framebuffers = new Map();
  const renderbuffers = new Map();
  const uniformLocations = new Map();

  let nextBufferId = 1;
  let nextTextureId = 1;
  let nextShaderId = 1;
  let nextProgramId = 1;
  let nextFramebufferId = 1;
  let nextRenderbufferId = 1;
  let nextUniformLocId = 1;

  const utf8Decoder = new TextDecoder('utf-8');
  const utf8Encoder = new TextEncoder();

  function getString(ptr, len) {
    if (ptr === 0) return '';
    const mem = getMemory();
    if (len >= 0) {
      return utf8Decoder.decode(new Uint8Array(mem.buffer, ptr, len));
    }
    // Null-terminated string
    const u8 = new Uint8Array(mem.buffer, ptr);
    let end = 0;
    while (u8[end] !== 0) end++;
    return utf8Decoder.decode(new Uint8Array(mem.buffer, ptr, end));
  }

  function writeString(str, bufPtr, maxLen) {
    if (bufPtr === 0 || maxLen <= 0) return 0;
    const mem = getMemory();
    const encoded = utf8Encoder.encode(str);
    const writeLen = Math.min(encoded.length, maxLen - 1);
    const dest = new Uint8Array(mem.buffer, bufPtr, maxLen);
    dest.set(encoded.subarray(0, writeLen));
    dest[writeLen] = 0;
    return writeLen;
  }

  function getBytesPerPixel(format, type) {
    // 0x1406 = FLOAT
    // 0x1401 = UNSIGNED_BYTE
    // 0x8363 = UNSIGNED_SHORT_5_6_5
    // 0x8033 = UNSIGNED_SHORT_4_4_4_4
    // 0x8034 = UNSIGNED_SHORT_5_5_5_1
    let channels = 4;
    switch (format) {
      case 0x1906: channels = 1; break; // ALPHA
      case 0x1909: channels = 1; break; // LUMINANCE
      case 0x190A: channels = 2; break; // LUMINANCE_ALPHA
      case 0x1907: channels = 3; break; // RGB
      case 0x1908: channels = 4; break; // RGBA
      case 0x1902: channels = 1; break; // DEPTH_COMPONENT
    }

    if (type === 0x1406) return channels * 4; // FLOAT
    if (type === 0x8363 || type === 0x8033 || type === 0x8034 || type === 0x1403) return 2; // UNSIGNED_SHORT
    return channels; // UNSIGNED_BYTE
  }

  // Extensions query
  let anisoExt = null;
  if (gl && gl.getExtension) {
    anisoExt = gl.getExtension('EXT_texture_filter_anisotropic') ||
               gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic') ||
               gl.getExtension('MOZ_EXT_texture_filter_anisotropic');
    gl.getExtension('OES_texture_float');
    gl.getExtension('OES_texture_half_float');
    gl.getExtension('OES_element_index_uint');
    gl.getExtension('OES_standard_derivatives');
  }

  return {
    // Scalar & State
    glViewport: (x, y, w, h) => gl.viewport(x, y, w, h),
    glClear: (mask) => gl.clear(mask),
    glClearColor: (r, g, b, a) => gl.clearColor(r, g, b, a),
    glClearDepthf: (d) => gl.clearDepth(d),
    glClearStencil: (s) => gl.clearStencil(s),
    glColorMask: (r, g, b, a) => gl.colorMask(!!r, !!g, !!b, !!a),
    glDepthMask: (flag) => gl.depthMask(!!flag),
    glDepthFunc: (func) => gl.depthFunc(func),
    glDepthRangef: (n, f) => gl.depthRange(n, f),
    glCullFace: (mode) => gl.cullFace(mode),
    glFrontFace: (mode) => gl.frontFace(mode),
    glEnable: (cap) => gl.enable(cap),
    glDisable: (cap) => gl.disable(cap),
    glBlendFunc: (s, d) => gl.blendFunc(s, d),
    glBlendFuncSeparate: (sRGB, dRGB, sA, dA) => gl.blendFuncSeparate(sRGB, dRGB, sA, dA),
    glBlendEquation: (mode) => gl.blendEquation(mode),
    glBlendEquationSeparate: (modeRGB, modeA) => gl.blendEquationSeparate(modeRGB, modeA),
    glBlendColor: (r, g, b, a) => gl.blendColor(r, g, b, a),
    glLineWidth: (w) => gl.lineWidth(w),
    glPolygonOffset: (factor, units) => gl.polygonOffset(factor, units),
    glScissor: (x, y, w, h) => gl.scissor(x, y, w, h),
    glSampleCoverage: (value, invert) => gl.sampleCoverage(value, !!invert),
    glHint: (target, mode) => gl.hint(target, mode),
    glPixelStorei: (pname, param) => gl.pixelStorei(pname, param),
    glFlush: () => gl.flush(),
    glFinish: () => gl.finish(),
    glGetError: () => gl.getError(),

    // Buffer management
    glGenBuffers: (n, ptr) => {
      const mem = getMemory();
      const u32 = new Uint32Array(mem.buffer, ptr, n);
      for (let i = 0; i < n; i++) {
        const id = nextBufferId++;
        buffers.set(id, gl.createBuffer());
        u32[i] = id;
      }
    },
    glDeleteBuffers: (n, ptr) => {
      const mem = getMemory();
      const u32 = new Uint32Array(mem.buffer, ptr, n);
      for (let i = 0; i < n; i++) {
        const id = u32[i];
        const buf = buffers.get(id);
        if (buf) {
          gl.deleteBuffer(buf);
          buffers.delete(id);
        }
      }
    },
    glBindBuffer: (target, id) => {
      gl.bindBuffer(target, id ? buffers.get(id) || null : null);
    },
    glBufferData: (target, size, dataPtr, usage) => {
      if (dataPtr === 0) {
        gl.bufferData(target, size, usage);
      } else {
        const mem = getMemory();
        const data = new Uint8Array(mem.buffer, dataPtr, size);
        gl.bufferData(target, data, usage);
      }
    },
    glBufferSubData: (target, offset, size, dataPtr) => {
      const mem = getMemory();
      const data = new Uint8Array(mem.buffer, dataPtr, size);
      gl.bufferSubData(target, offset, data);
    },

    // Texture management
    glGenTextures: (n, ptr) => {
      const mem = getMemory();
      const u32 = new Uint32Array(mem.buffer, ptr, n);
      for (let i = 0; i < n; i++) {
        const id = nextTextureId++;
        textures.set(id, gl.createTexture());
        u32[i] = id;
      }
    },
    glDeleteTextures: (n, ptr) => {
      const mem = getMemory();
      const u32 = new Uint32Array(mem.buffer, ptr, n);
      for (let i = 0; i < n; i++) {
        const id = u32[i];
        const tex = textures.get(id);
        if (tex) {
          gl.deleteTexture(tex);
          textures.delete(id);
        }
      }
    },
    glBindTexture: (target, id) => {
      gl.bindTexture(target, id ? textures.get(id) || null : null);
    },
    glActiveTexture: (texture) => gl.activeTexture(texture),
    glTexParameteri: (target, pname, param) => gl.texParameteri(target, pname, param),
    glTexParameterf: (target, pname, param) => gl.texParameterf(target, pname, param),
    glTexParameteriv: (target, pname, ptr) => {
      const mem = getMemory();
      gl.texParameteri(target, pname, new Int32Array(mem.buffer, ptr, 1)[0]);
    },
    glTexParameterfv: (target, pname, ptr) => {
      const mem = getMemory();
      gl.texParameterf(target, pname, new Float32Array(mem.buffer, ptr, 1)[0]);
    },
    glGenerateMipmap: (target) => gl.generateMipmap(target),
    glTexImage2D: (target, level, internalformat, width, height, border, format, type, pixelsPtr) => {
      if (pixelsPtr === 0) {
        gl.texImage2D(target, level, internalformat, width, height, border, format, type, null);
      } else {
        const mem = getMemory();
        const bpp = getBytesPerPixel(format, type);
        const byteLen = width * height * bpp;
        const data = new Uint8Array(mem.buffer, pixelsPtr, byteLen);
        gl.texImage2D(target, level, internalformat, width, height, border, format, type, data);
      }
    },
    glTexSubImage2D: (target, level, xoffset, yoffset, width, height, format, type, pixelsPtr) => {
      const mem = getMemory();
      const bpp = getBytesPerPixel(format, type);
      const byteLen = width * height * bpp;
      const data = new Uint8Array(mem.buffer, pixelsPtr, byteLen);
      gl.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, data);
    },
    glCompressedTexImage2D: (target, level, internalformat, width, height, border, imageSize, dataPtr) => {
      const mem = getMemory();
      const data = new Uint8Array(mem.buffer, dataPtr, imageSize);
      gl.compressedTexImage2D(target, level, internalformat, width, height, border, data);
    },
    glCompressedTexSubImage2D: (target, level, xoffset, yoffset, width, height, format, imageSize, dataPtr) => {
      const mem = getMemory();
      const data = new Uint8Array(mem.buffer, dataPtr, imageSize);
      gl.compressedTexSubImage2D(target, level, xoffset, yoffset, width, height, format, data);
    },
    glCopyTexImage2D: (target, level, internalformat, x, y, width, height, border) => {
      gl.copyTexImage2D(target, level, internalformat, x, y, width, height, border);
    },
    glCopyTexSubImage2D: (target, level, xoffset, yoffset, x, y, width, height) => {
      gl.copyTexSubImage2D(target, level, xoffset, yoffset, x, y, width, height);
    },

    // Shaders & Programs
    glCreateShader: (type) => {
      const id = nextShaderId++;
      shaders.set(id, gl.createShader(type));
      return id;
    },
    glDeleteShader: (id) => {
      const s = shaders.get(id);
      if (s) {
        gl.deleteShader(s);
        shaders.delete(id);
      }
    },
    glCompileShader: (id) => {
      const s = shaders.get(id);
      if (s) gl.compileShader(s);
    },
    glGetShaderiv: (id, pname, paramsPtr) => {
      const s = shaders.get(id);
      const mem = getMemory();
      const out = new Int32Array(mem.buffer, paramsPtr, 1);
      if (!s) { out[0] = 0; return; }
      if (pname === 0x8B84) { // GL_INFO_LOG_LENGTH
        const log = gl.getShaderInfoLog(s) || '';
        out[0] = log.length > 0 ? log.length + 1 : 0;
      } else {
        const val = gl.getShaderParameter(s, pname);
        out[0] = typeof val === 'boolean' ? (val ? 1 : 0) : (val || 0);
      }
    },
    glCreateProgram: () => {
      const id = nextProgramId++;
      programs.set(id, gl.createProgram());
      return id;
    },
    glDeleteProgram: (id) => {
      const p = programs.get(id);
      if (p) {
        gl.deleteProgram(p);
        programs.delete(id);
      }
    },
    glAttachShader: (progId, shaderId) => {
      const p = programs.get(progId);
      const s = shaders.get(shaderId);
      if (p && s) gl.attachShader(p, s);
    },
    glDetachShader: (progId, shaderId) => {
      const p = programs.get(progId);
      const s = shaders.get(shaderId);
      if (p && s) gl.detachShader(p, s);
    },
    glLinkProgram: (progId) => {
      const p = programs.get(progId);
      if (p) gl.linkProgram(p);
    },
    glUseProgram: (progId) => {
      gl.useProgram(progId ? programs.get(progId) || null : null);
    },
    glValidateProgram: (progId) => {
      const p = programs.get(progId);
      if (p) gl.validateProgram(p);
    },
    glGetProgramiv: (progId, pname, paramsPtr) => {
      const p = programs.get(progId);
      const mem = getMemory();
      const out = new Int32Array(mem.buffer, paramsPtr, 1);
      if (!p) { out[0] = 0; return; }
      if (pname === 0x8B84) { // GL_INFO_LOG_LENGTH
        const log = gl.getProgramInfoLog(p) || '';
        out[0] = log.length > 0 ? log.length + 1 : 0;
      } else {
        const val = gl.getProgramParameter(p, pname);
        out[0] = typeof val === 'boolean' ? (val ? 1 : 0) : (val || 0);
      }
    },

    // Vertex Attributes
    glVertexAttribPointer: (index, size, type, normalized, stride, offset) => {
      gl.vertexAttribPointer(index, size, type, !!normalized, stride, offset);
    },
    glEnableVertexAttribArray: (index) => gl.enableVertexAttribArray(index),
    glDisableVertexAttribArray: (index) => gl.disableVertexAttribArray(index),
    glVertexAttrib1f: (index, x) => gl.vertexAttrib1f(index, x),
    glVertexAttrib2f: (index, x, y) => gl.vertexAttrib2f(index, x, y),
    glVertexAttrib3f: (index, x, y, z) => gl.vertexAttrib3f(index, x, y, z),
    glVertexAttrib4f: (index, x, y, z, w) => gl.vertexAttrib4f(index, x, y, z, w),
    glVertexAttrib1fv: (index, ptr) => {
      const mem = getMemory();
      gl.vertexAttrib1fv(index, new Float32Array(mem.buffer, ptr, 1));
    },
    glVertexAttrib2fv: (index, ptr) => {
      const mem = getMemory();
      gl.vertexAttrib2fv(index, new Float32Array(mem.buffer, ptr, 2));
    },
    glVertexAttrib3fv: (index, ptr) => {
      const mem = getMemory();
      gl.vertexAttrib3fv(index, new Float32Array(mem.buffer, ptr, 3));
    },
    glVertexAttrib4fv: (index, ptr) => {
      const mem = getMemory();
      gl.vertexAttrib4fv(index, new Float32Array(mem.buffer, ptr, 4));
    },

    // Uniforms
    glUniform1i: (locId, x) => {
      const loc = uniformLocations.get(locId);
      if (loc) gl.uniform1i(loc, x);
    },
    glUniform1f: (locId, x) => {
      const loc = uniformLocations.get(locId);
      if (loc) gl.uniform1f(loc, x);
    },
    glUniform2f: (locId, x, y) => {
      const loc = uniformLocations.get(locId);
      if (loc) gl.uniform2f(loc, x, y);
    },
    glUniform3f: (locId, x, y, z) => {
      const loc = uniformLocations.get(locId);
      if (loc) gl.uniform3f(loc, x, y, z);
    },
    glUniform4f: (locId, x, y, z, w) => {
      const loc = uniformLocations.get(locId);
      if (loc) gl.uniform4f(loc, x, y, z, w);
    },
    glUniform1iv: (locId, count, ptr) => {
      const loc = uniformLocations.get(locId);
      if (loc) {
        const mem = getMemory();
        gl.uniform1iv(loc, new Int32Array(mem.buffer, ptr, count));
      }
    },
    glUniform2iv: (locId, count, ptr) => {
      const loc = uniformLocations.get(locId);
      if (loc) {
        const mem = getMemory();
        gl.uniform2iv(loc, new Int32Array(mem.buffer, ptr, count * 2));
      }
    },
    glUniform3iv: (locId, count, ptr) => {
      const loc = uniformLocations.get(locId);
      if (loc) {
        const mem = getMemory();
        gl.uniform3iv(loc, new Int32Array(mem.buffer, ptr, count * 3));
      }
    },
    glUniform4iv: (locId, count, ptr) => {
      const loc = uniformLocations.get(locId);
      if (loc) {
        const mem = getMemory();
        gl.uniform4iv(loc, new Int32Array(mem.buffer, ptr, count * 4));
      }
    },
    glUniform1fv: (locId, count, ptr) => {
      const loc = uniformLocations.get(locId);
      if (loc) {
        const mem = getMemory();
        gl.uniform1fv(loc, new Float32Array(mem.buffer, ptr, count));
      }
    },
    glUniform2fv: (locId, count, ptr) => {
      const loc = uniformLocations.get(locId);
      if (loc) {
        const mem = getMemory();
        gl.uniform2fv(loc, new Float32Array(mem.buffer, ptr, count * 2));
      }
    },
    glUniform3fv: (locId, count, ptr) => {
      const loc = uniformLocations.get(locId);
      if (loc) {
        const mem = getMemory();
        gl.uniform3fv(loc, new Float32Array(mem.buffer, ptr, count * 3));
      }
    },
    glUniform4fv: (locId, count, ptr) => {
      const loc = uniformLocations.get(locId);
      if (loc) {
        const mem = getMemory();
        gl.uniform4fv(loc, new Float32Array(mem.buffer, ptr, count * 4));
      }
    },
    glUniformMatrix2fv: (locId, count, transpose, ptr) => {
      const loc = uniformLocations.get(locId);
      if (loc) {
        const mem = getMemory();
        gl.uniformMatrix2fv(loc, !!transpose, new Float32Array(mem.buffer, ptr, count * 4));
      }
    },
    glUniformMatrix3fv: (locId, count, transpose, ptr) => {
      const loc = uniformLocations.get(locId);
      if (loc) {
        const mem = getMemory();
        gl.uniformMatrix3fv(loc, !!transpose, new Float32Array(mem.buffer, ptr, count * 9));
      }
    },
    glUniformMatrix4fv: (locId, count, transpose, ptr) => {
      const loc = uniformLocations.get(locId);
      if (loc) {
        const mem = getMemory();
        gl.uniformMatrix4fv(loc, !!transpose, new Float32Array(mem.buffer, ptr, count * 16));
      }
    },

    // Drawing
    glDrawArrays: (mode, first, count) => gl.drawArrays(mode, first, count),
    glDrawElements: (mode, count, type, indicesOffset) => gl.drawElements(mode, count, type, indicesOffset),

    // Framebuffer & Renderbuffer
    glGenFramebuffers: (n, ptr) => {
      const mem = getMemory();
      const u32 = new Uint32Array(mem.buffer, ptr, n);
      for (let i = 0; i < n; i++) {
        const id = nextFramebufferId++;
        framebuffers.set(id, gl.createFramebuffer());
        u32[i] = id;
      }
    },
    glDeleteFramebuffers: (n, ptr) => {
      const mem = getMemory();
      const u32 = new Uint32Array(mem.buffer, ptr, n);
      for (let i = 0; i < n; i++) {
        const id = u32[i];
        const fb = framebuffers.get(id);
        if (fb) {
          gl.deleteFramebuffer(fb);
          framebuffers.delete(id);
        }
      }
    },
    glBindFramebuffer: (target, id) => {
      gl.bindFramebuffer(target, id ? framebuffers.get(id) || null : null);
    },
    glCheckFramebufferStatus: (target) => gl.checkFramebufferStatus(target),
    glFramebufferTexture2D: (target, attachment, textarget, texId, level) => {
      gl.framebufferTexture2D(target, attachment, textarget, textures.get(texId) || null, level);
    },
    glFramebufferRenderbuffer: (target, attachment, rbTarget, rbId) => {
      gl.framebufferRenderbuffer(target, attachment, rbTarget, renderbuffers.get(rbId) || null);
    },
    glGenRenderbuffers: (n, ptr) => {
      const mem = getMemory();
      const u32 = new Uint32Array(mem.buffer, ptr, n);
      for (let i = 0; i < n; i++) {
        const id = nextRenderbufferId++;
        renderbuffers.set(id, gl.createRenderbuffer());
        u32[i] = id;
      }
    },
    glDeleteRenderbuffers: (n, ptr) => {
      const mem = getMemory();
      const u32 = new Uint32Array(mem.buffer, ptr, n);
      for (let i = 0; i < n; i++) {
        const id = u32[i];
        const rb = renderbuffers.get(id);
        if (rb) {
          gl.deleteRenderbuffer(rb);
          renderbuffers.delete(id);
        }
      }
    },
    glBindRenderbuffer: (target, id) => {
      gl.bindRenderbuffer(target, id ? renderbuffers.get(id) || null : null);
    },
    glRenderbufferStorage: (target, internalformat, width, height) => {
      gl.renderbufferStorage(target, internalformat, width, height);
    },
    glGetFramebufferAttachmentParameteriv: (target, attachment, pname, paramsPtr) => {
      const val = gl.getFramebufferAttachmentParameter(target, attachment, pname);
      const mem = getMemory();
      new Int32Array(mem.buffer, paramsPtr, 1)[0] = typeof val === 'number' ? val : 0;
    },
    glGetRenderbufferParameteriv: (target, pname, paramsPtr) => {
      const val = gl.getRenderbufferParameter(target, pname);
      const mem = getMemory();
      new Int32Array(mem.buffer, paramsPtr, 1)[0] = typeof val === 'number' ? val : 0;
    },

    // Queries
    glGetIntegerv: (pname, paramsPtr) => {
      const mem = getMemory();
      const out = new Int32Array(mem.buffer, paramsPtr, 4);
      switch (pname) {
        case 0x0D33: // GL_MAX_TEXTURE_SIZE
          out[0] = gl.getParameter(pname) || 2048;
          break;
        case 0x8872: // GL_MAX_TEXTURE_IMAGE_UNITS
          out[0] = gl.getParameter(pname) || 8;
          break;
        case 0x8869: // GL_MAX_VERTEX_ATTRIBS
          out[0] = gl.getParameter(pname) || 8;
          break;
        case 0x851C: // GL_MAX_CUBE_MAP_TEXTURE_SIZE
          out[0] = gl.getParameter(pname) || 2048;
          break;
        case 0x0BA2: { // GL_VIEWPORT
          const vp = gl.getParameter(pname);
          if (vp) {
            out[0] = vp[0]; out[1] = vp[1]; out[2] = vp[2]; out[3] = vp[3];
          }
          break;
        }
        case 0x86A2: // GL_NUM_COMPRESSED_TEXTURE_FORMATS
          out[0] = 0;
          break;
        default: {
          const val = gl.getParameter(pname);
          out[0] = typeof val === 'number' ? val : 0;
          break;
        }
      }
    },
    glGetFloatv: (pname, paramsPtr) => {
      const mem = getMemory();
      const out = new Float32Array(mem.buffer, paramsPtr, 1);
      if (pname === 0x84FF) { // GL_MAX_TEXTURE_MAX_ANISOTROPY_EXT
        if (anisoExt) {
          out[0] = gl.getParameter(anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1.0;
        } else {
          out[0] = 1.0;
        }
      } else {
        const val = gl.getParameter(pname);
        out[0] = typeof val === 'number' ? val : 0.0;
      }
    },
    glGetBooleanv: (pname, paramsPtr) => {
      const mem = getMemory();
      const val = gl.getParameter(pname);
      new Uint8Array(mem.buffer, paramsPtr, 1)[0] = val ? 1 : 0;
    },
    glGetBufferParameteriv: (target, pname, paramsPtr) => {
      const val = gl.getBufferParameter(target, pname);
      const mem = getMemory();
      new Int32Array(mem.buffer, paramsPtr, 1)[0] = typeof val === 'number' ? val : 0;
    },
    glReadPixels: (x, y, w, h, format, type, pixelsPtr) => {
      const mem = getMemory();
      const bpp = getBytesPerPixel(format, type);
      const data = new Uint8Array(mem.buffer, pixelsPtr, w * h * bpp);
      gl.readPixels(x, y, w, h, format, type, data);
    },

    // C Wrappers raw host imports
    gl_host_get_string: (name, bufPtr, maxLen) => {
      let str = '';
      switch (name) {
        case 0x1F00: str = 'WebKit / WebGL'; break; // GL_VENDOR
        case 0x1F01: str = 'WebGL Canvas Renderer'; break; // GL_RENDERER
        case 0x1F02: str = 'OpenGL ES 2.0 (WebGL 1.0)'; break; // GL_VERSION
        case 0x8B8C: str = 'WebGL GLSL ES 1.0'; break; // GL_SHADING_LANGUAGE_VERSION
        case 0x1F03: // GL_EXTENSIONS
          str = 'GL_OES_texture_float GL_OES_texture_half_float GL_OES_element_index_uint GL_OES_standard_derivatives';
          if (anisoExt) str += ' GL_EXT_texture_filter_anisotropic';
          break;
      }
      return writeString(str, bufPtr, maxLen);
    },
    gl_host_shader_source: (shaderId, srcPtr, len) => {
      const s = shaders.get(shaderId);
      if (!s) return;
      let source = getString(srcPtr, len);
      gl.shaderSource(s, source);
    },
    gl_host_get_shader_info_log: (shaderId, maxLen, lenPtr, bufPtr) => {
      const s = shaders.get(shaderId);
      const log = s ? (gl.getShaderInfoLog(s) || '') : '';
      const written = writeString(log, bufPtr, maxLen);
      if (lenPtr !== 0) {
        const mem = getMemory();
        new Int32Array(mem.buffer, lenPtr, 1)[0] = written;
      }
    },
    gl_host_get_program_info_log: (progId, maxLen, lenPtr, bufPtr) => {
      const p = programs.get(progId);
      const log = p ? (gl.getProgramInfoLog(p) || '') : '';
      const written = writeString(log, bufPtr, maxLen);
      if (lenPtr !== 0) {
        const mem = getMemory();
        new Int32Array(mem.buffer, lenPtr, 1)[0] = written;
      }
    },
    gl_host_get_uniform_location: (progId, namePtr, nameLen) => {
      const p = programs.get(progId);
      if (!p) return -1;
      const name = getString(namePtr, nameLen);
      const loc = gl.getUniformLocation(p, name);
      if (!loc) return -1;
      const id = nextUniformLocId++;
      uniformLocations.set(id, loc);
      return id;
    },
    gl_host_get_attrib_location: (progId, namePtr, nameLen) => {
      const p = programs.get(progId);
      if (!p) return -1;
      const name = getString(namePtr, nameLen);
      return gl.getAttribLocation ? gl.getAttribLocation(p, name) : 0;
    },
    gl_host_bind_attrib_location: (progId, index, namePtr, nameLen) => {
      const p = programs.get(progId);
      if (!p) return;
      const name = getString(namePtr, nameLen);
      if (gl.bindAttribLocation) gl.bindAttribLocation(p, index, name);
    }
  };
}

function createMockGL(stats = {}) {
  stats.clearCount = 0;
  stats.drawArraysCount = 0;
  stats.drawElementsCount = 0;
  stats.buffersCreated = 0;
  stats.texturesCreated = 0;
  stats.shadersCreated = 0;
  stats.programsCreated = 0;
  stats.uniformsSet = 0;
  stats.lastViewport = { x: 0, y: 0, width: 800, height: 450 };

  const shaderSources = new Map();
  const uniformLocations = new Map();
  let nextLocId = 1;

  return {
    stats,
    viewport: (x, y, w, h) => { stats.lastViewport = { x, y, width: w, height: h }; },
    clear: (mask) => { stats.clearCount++; },
    clearColor: () => {},
    clearDepth: () => {},
    clearStencil: () => {},
    colorMask: () => {},
    depthMask: () => {},
    depthFunc: () => {},
    depthRange: () => {},
    cullFace: () => {},
    frontFace: () => {},
    enable: () => {},
    disable: () => {},
    blendFunc: () => {},
    blendFuncSeparate: () => {},
    blendEquation: () => {},
    blendEquationSeparate: () => {},
    blendColor: () => {},
    lineWidth: () => {},
    polygonOffset: () => {},
    scissor: () => {},
    sampleCoverage: () => {},
    hint: () => {},
    pixelStorei: () => {},
    flush: () => {},
    finish: () => {},
    getError: () => 0,

    createBuffer: () => {
      stats.buffersCreated++;
      return { id: stats.buffersCreated };
    },
    deleteBuffer: () => {},
    bindBuffer: () => {},
    bufferData: () => {},
    bufferSubData: () => {},

    createTexture: () => {
      stats.texturesCreated++;
      return { id: stats.texturesCreated };
    },
    deleteTexture: () => {},
    bindTexture: () => {},
    activeTexture: () => {},
    texParameteri: () => {},
    texParameterf: () => {},
    generateMipmap: () => {},
    texImage2D: () => {},
    texSubImage2D: () => {},

    createShader: (type) => {
      stats.shadersCreated++;
      return { id: stats.shadersCreated, type };
    },
    deleteShader: () => {},
    shaderSource: (shader, source) => {
      if (shader) shaderSources.set(shader.id, source);
    },
    compileShader: () => {},
    getShaderParameter: () => 1,
    getShaderInfoLog: () => '',

    createProgram: () => {
      stats.programsCreated++;
      return { id: stats.programsCreated };
    },
    deleteProgram: () => {},
    attachShader: () => {},
    detachShader: () => {},
    linkProgram: () => {},
    useProgram: () => {},
    validateProgram: () => {},
    bindAttribLocation: () => {},
    getAttribLocation: () => 0,
    getProgramParameter: () => 1,
    getProgramInfoLog: () => '',

    vertexAttribPointer: () => {},
    enableVertexAttribArray: () => {},
    disableVertexAttribArray: () => {},
    vertexAttrib1f: () => {},
    vertexAttrib2f: () => {},
    vertexAttrib3f: () => {},
    vertexAttrib4f: () => {},

    getUniformLocation: (prog, name) => {
      const key = `${prog ? prog.id : 0}:${name}`;
      if (!uniformLocations.has(key)) {
        uniformLocations.set(key, { id: nextLocId++, name });
      }
      return uniformLocations.get(key);
    },
    uniform1i: () => { stats.uniformsSet++; },
    uniform2i: () => { stats.uniformsSet++; },
    uniform3i: () => { stats.uniformsSet++; },
    uniform4i: () => { stats.uniformsSet++; },
    uniform1iv: () => { stats.uniformsSet++; },
    uniform2iv: () => { stats.uniformsSet++; },
    uniform3iv: () => { stats.uniformsSet++; },
    uniform4iv: () => { stats.uniformsSet++; },
    uniform1f: () => { stats.uniformsSet++; },
    uniform2f: () => { stats.uniformsSet++; },
    uniform3f: () => { stats.uniformsSet++; },
    uniform4f: () => { stats.uniformsSet++; },
    uniform1fv: () => { stats.uniformsSet++; },
    uniform2fv: () => { stats.uniformsSet++; },
    uniform3fv: () => { stats.uniformsSet++; },
    uniform4fv: () => { stats.uniformsSet++; },
    uniformMatrix2fv: () => { stats.uniformsSet++; },
    uniformMatrix3fv: () => { stats.uniformsSet++; },
    uniformMatrix4fv: () => { stats.uniformsSet++; },

    drawArrays: () => { stats.drawArraysCount++; },
    drawElements: () => { stats.drawElementsCount++; },

    getParameter: (pname) => {
      if (pname === 0x0D33 || pname === 0x84E8) return 4096;
      if (pname === 0x8869) return 16;
      return 2048;
    },

    getExtension: (name) => {
      if (name.includes('anisotropic')) return { MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84FF };
      return {};
    }
  };
}


// canvas-wasi: Keyboard, Mouse, and Touch Input Coordinator with SharedArrayBuffer support

const DOM_KEY_MAP = {
  KeyA: 65, KeyB: 66, KeyC: 67, KeyD: 68, KeyE: 69, KeyF: 70, KeyG: 71,
  KeyH: 72, KeyI: 73, KeyJ: 74, KeyK: 75, KeyL: 76, KeyM: 77, KeyN: 78,
  KeyO: 79, KeyP: 80, KeyQ: 81, KeyR: 82, KeyS: 83, KeyT: 84, KeyU: 85,
  KeyV: 86, KeyW: 87, KeyX: 88, KeyY: 89, KeyZ: 90,

  Digit0: 48, Digit1: 49, Digit2: 50, Digit3: 51, Digit4: 52,
  Digit5: 53, Digit6: 54, Digit7: 55, Digit8: 56, Digit9: 57,

  Space: 32, Escape: 256, Enter: 257, Tab: 258, Backspace: 259,
  Insert: 260, Delete: 261, ArrowRight: 262, ArrowLeft: 263, ArrowDown: 264, ArrowUp: 265,
  PageUp: 266, PageDown: 267, Home: 268, End: 269,
  CapsLock: 280, ScrollLock: 281, NumLock: 282, PrintScreen: 283, Pause: 284,

  F1: 290, F2: 291, F3: 292, F4: 293, F5: 294, F6: 295,
  F7: 296, F8: 297, F9: 298, F10: 299, F11: 300, F12: 301,

  ShiftLeft: 340, ControlLeft: 341, AltLeft: 342, MetaLeft: 343,
  ShiftRight: 344, ControlRight: 345, AltRight: 346, MetaRight: 347,
  ContextMenu: 348,

  Semicolon: 59, Equal: 61, Comma: 44, Minus: 45, Period: 46, Slash: 47,
  Backquote: 96, BracketLeft: 91, Backslash: 92, BracketRight: 93, Quote: 39,

  Numpad0: 320, Numpad1: 321, Numpad2: 322, Numpad3: 323, Numpad4: 324,
  Numpad5: 325, Numpad6: 326, Numpad7: 327, Numpad8: 328, Numpad9: 329,
  NumpadDecimal: 330, NumpadDivide: 331, NumpadMultiply: 332,
  NumpadSubtract: 333, NumpadAdd: 334, NumpadEnter: 335, NumpadEqual: 336
};

class InputCoordinator {
  constructor(options = {}) {
    this.sharedBuffer = options.sharedBuffer || null;
    this.canvas = options.canvas || null;

    this.windowWidth = options.width || 800;
    this.windowHeight = options.height || 450;
    this.renderWidth = options.width || 800;
    this.renderHeight = options.height || 450;
    this.dpiScale = options.dpiScale || 1.0;
    this.shouldClose = false;

    this.mouseX = -1;
    this.mouseY = -1;
    this.mouseWheelX = 0;
    this.mouseWheelY = 0;
    this.mouseButtons = 0;

    this.keysDown = new Uint32Array(16); // 512 bits
    this.keyPressedQueue = [];
    this.charPressedQueue = [];
    this.listeners = new Set();
    this.cleanupFn = null;

    if (this.sharedBuffer) {
      this.sharedView = new DataView(this.sharedBuffer);
      this.sharedU8 = new Uint8Array(this.sharedBuffer);
      this.syncWord = new Int32Array(this.sharedBuffer, 372, 1);
    }

    if (this.canvas && typeof this.canvas.addEventListener === 'function') {
      this.attachListeners(this.canvas);
    }
  }

  addListener(fn) {
    if (typeof fn === 'function') {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }
    return () => {};
  }

  notifyListeners(event) {
    for (const fn of this.listeners) {
      try {
        fn(event);
      } catch (_) {}
    }
  }

  detach() {
    if (typeof this.cleanupFn === 'function') {
      this.cleanupFn();
      this.cleanupFn = null;
    }
  }

  attachListeners(canvas, windowTarget = null) {
    this.detach();

    if (!canvas || typeof canvas.addEventListener !== 'function') return;

    const getCoords = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / (rect.width || 1);
      const scaleY = canvas.height / (rect.height || 1);
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    };

    const onMouseMove = (e) => {
      const pos = getCoords(e);
      this.mouseX = pos.x;
      this.mouseY = pos.y;
      if (typeof e.buttons === 'number') {
        this.mouseButtons = e.buttons;
      }
      this.updateSharedState();
      this.notifyListeners({ type: 'mouse', x: this.mouseX, y: this.mouseY, buttons: this.mouseButtons, wheel: this.mouseWheelY });
    };

    const onMouseDown = (e) => {
      if (typeof e.buttons === 'number' && e.buttons > 0) {
        this.mouseButtons = e.buttons;
      } else {
        const bit = e.button === 0 ? 1 : (e.button === 2 ? 2 : (e.button === 1 ? 4 : 0));
        this.mouseButtons |= bit;
      }
      const pos = getCoords(e);
      this.mouseX = pos.x;
      this.mouseY = pos.y;
      this.updateSharedState();
      this.notifyListeners({ type: 'mouse', x: this.mouseX, y: this.mouseY, buttons: this.mouseButtons, wheel: this.mouseWheelY });
    };

    const onMouseUp = (e) => {
      if (typeof e.buttons === 'number') {
        this.mouseButtons = e.buttons;
      } else {
        const bit = e.button === 0 ? 1 : (e.button === 2 ? 2 : (e.button === 1 ? 4 : 0));
        this.mouseButtons &= ~bit;
      }
      const pos = getCoords(e);
      this.mouseX = pos.x;
      this.mouseY = pos.y;
      this.updateSharedState();
      this.notifyListeners({ type: 'mouse', x: this.mouseX, y: this.mouseY, buttons: this.mouseButtons, wheel: this.mouseWheelY });
    };

    const onMouseLeave = () => {
      this.mouseX = -1;
      this.mouseY = -1;
      this.mouseButtons = 0;
      this.updateSharedState();
      this.notifyListeners({ type: 'mouse', x: -1, y: -1, buttons: 0, wheel: this.mouseWheelY });
    };

    const onWheel = (e) => {
      this.mouseWheelX += (e.deltaX > 0 ? 1 : (e.deltaX < 0 ? -1 : 0));
      this.mouseWheelY += (e.deltaY > 0 ? -1 : (e.deltaY < 0 ? 1 : 0));
      this.updateSharedState();
      this.notifyListeners({ type: 'mouse', x: this.mouseX, y: this.mouseY, buttons: this.mouseButtons, wheel: this.mouseWheelY });
      e.preventDefault();
    };

    const onContextMenu = (e) => e.preventDefault();

    const onKeyDown = (e) => {
      if (e.target && e.target.id === 'btn-dock') return;
      const key = DOM_KEY_MAP[e.code] || e.keyCode;
      if (key >= 0 && key < 512) {
        const word = Math.floor(key / 32);
        const bit = key % 32;
        this.keysDown[word] |= (1 << bit);
        if (this.keyPressedQueue.length < 32) {
          this.keyPressedQueue.push(key);
        }
      }
      if (e.key && e.key.length === 1) {
        const cp = e.key.codePointAt(0);
        if (cp && this.charPressedQueue.length < 32) {
          this.charPressedQueue.push(cp);
        }
      }
      if (e.code === 'Escape') {
        this.shouldClose = true;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        if (typeof e.preventDefault === 'function') {
          e.preventDefault();
        }
      }
      this.updateSharedState();
      this.notifyListeners({ type: 'keydown', key, code: e.code });
    };

    const onKeyUp = (e) => {
      if (e.target && e.target.id === 'btn-dock') return;
      const key = DOM_KEY_MAP[e.code] || e.keyCode;
      if (key >= 0 && key < 512) {
        const word = Math.floor(key / 32);
        const bit = key % 32;
        this.keysDown[word] &= ~(1 << bit);
      }
      this.updateSharedState();
      this.notifyListeners({ type: 'keyup', key, code: e.code });
    };

    const onBlur = () => {
      this.keysDown.fill(0);
      this.mouseButtons = 0;
      this.updateSharedState();
      this.notifyListeners({ type: 'blur' });
    };

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseleave', onMouseLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);

    const keyTarget = windowTarget || canvas;
    const mouseUpTarget = windowTarget || canvas;

    mouseUpTarget.addEventListener('mouseup', onMouseUp);
    keyTarget.addEventListener('keydown', onKeyDown);
    keyTarget.addEventListener('keyup', onKeyUp);
    keyTarget.addEventListener('blur', onBlur);

    this.cleanupFn = () => {
      if (typeof canvas.removeEventListener === 'function') {
        canvas.removeEventListener('mousemove', onMouseMove);
        canvas.removeEventListener('mousedown', onMouseDown);
        canvas.removeEventListener('mouseleave', onMouseLeave);
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('contextmenu', onContextMenu);
      }
      if (typeof mouseUpTarget.removeEventListener === 'function') {
        mouseUpTarget.removeEventListener('mouseup', onMouseUp);
      }
      if (typeof keyTarget.removeEventListener === 'function') {
        keyTarget.removeEventListener('keydown', onKeyDown);
        keyTarget.removeEventListener('keyup', onKeyUp);
        keyTarget.removeEventListener('blur', onBlur);
      }
    };
  }

  reset() {
    this.shouldClose = false;
    this.mouseX = -1;
    this.mouseY = -1;
    this.mouseButtons = 0;
    this.mouseWheelX = 0;
    this.mouseWheelY = 0;
    this.keysDown.fill(0);
    this.keyPressedQueue.length = 0;
    this.charPressedQueue.length = 0;

    if (this.sharedBuffer) {
      this.sharedU8.fill(0);
      this.updateSharedState();
    }
  }

  updateSharedState() {
    if (!this.sharedView) return;
    const v = this.sharedView;
    v.setInt32(0, this.windowWidth, true);
    v.setInt32(4, this.windowHeight, true);
    v.setInt32(8, this.renderWidth, true);
    v.setInt32(12, this.renderHeight, true);
    v.setFloat32(16, this.dpiScale, true);
    v.setInt32(20, this.shouldClose ? 1 : 0, true);

    v.setFloat32(24, this.mouseX, true);
    v.setFloat32(28, this.mouseY, true);
    v.setFloat32(32, this.mouseWheelX, true);
    v.setFloat32(36, this.mouseWheelY, true);
    v.setUint32(40, this.mouseButtons, true);

    for (let i = 0; i < 16; i++) {
      v.setUint32(44 + i * 4, this.keysDown[i], true);
    }

    const kCount = Math.min(this.keyPressedQueue.length, 32);
    v.setInt32(108, kCount, true);
    for (let i = 0; i < kCount; i++) {
      v.setInt32(112 + i * 4, this.keyPressedQueue[i], true);
    }

    const cCount = Math.min(this.charPressedQueue.length, 32);
    v.setInt32(240, cCount, true);
    for (let i = 0; i < cCount; i++) {
      v.setInt32(244 + i * 4, this.charPressedQueue[i], true);
    }
  }

  // Poll state synchronously into Wasm linear memory (used by rcore_wasi or direct wasm callers)
  pollToWasm(destPtr, mem) {
    if (this.sharedBuffer) {
      const destU8 = new Uint8Array(mem.buffer, destPtr, 372);
      destU8.set(this.sharedU8.subarray(0, 372));
      this.sharedView.setFloat32(32, 0, true);
      this.sharedView.setFloat32(36, 0, true);
      this.sharedView.setInt32(108, 0, true);
      this.sharedView.setInt32(240, 0, true);
      return;
    }

    const view = new DataView(mem.buffer, destPtr, 372);
    view.setInt32(0, this.windowWidth, true);
    view.setInt32(4, this.windowHeight, true);
    view.setInt32(8, this.renderWidth, true);
    view.setInt32(12, this.renderHeight, true);
    view.setFloat32(16, this.dpiScale, true);
    view.setInt32(20, this.shouldClose ? 1 : 0, true);

    view.setFloat32(24, this.mouseX, true);
    view.setFloat32(28, this.mouseY, true);
    view.setFloat32(32, this.mouseWheelX, true);
    view.setFloat32(36, this.mouseWheelY, true);
    view.setUint32(40, this.mouseButtons, true);

    for (let i = 0; i < 16; i++) {
      view.setUint32(44 + i * 4, this.keysDown[i], true);
    }

    const kCount = Math.min(this.keyPressedQueue.length, 32);
    view.setInt32(108, kCount, true);
    for (let i = 0; i < kCount; i++) {
      view.setInt32(112 + i * 4, this.keyPressedQueue[i], true);
    }
    this.keyPressedQueue.length = 0;

    const cCount = Math.min(this.charPressedQueue.length, 32);
    view.setInt32(240, cCount, true);
    for (let i = 0; i < cCount; i++) {
      view.setInt32(244 + i * 4, this.charPressedQueue[i], true);
    }
    this.charPressedQueue.length = 0;
  }
}


// wasi.js - Standard WASI Snapshot Preview 1 implementation for browser & node

function createWasiImports(getMemory, options = {}) {
  const utf8Decoder = new TextDecoder('utf-8');
  let stdoutBuffer = '';
  let stderrBuffer = '';

  const printStdout = options.print || ((text) => console.log(text));
  const printStderr = options.printErr || ((text) => console.error(text));

  return {
    proc_exit: (code) => {
      if (options.onExit) options.onExit(code);
      const err = new Error(`WASI program exited with code ${code}`);
      err.exitCode = code;
      throw err;
    },

    environ_sizes_get: (countPtr, bufSizePtr) => {
      const mem = getMemory();
      new Uint32Array(mem.buffer, countPtr, 1)[0] = 0;
      new Uint32Array(mem.buffer, bufSizePtr, 1)[0] = 0;
      return 0; // Success
    },

    environ_get: (environ, environBuf) => 0,

    args_sizes_get: (argcPtr, argvBufSizePtr) => {
      const mem = getMemory();
      new Uint32Array(mem.buffer, argcPtr, 1)[0] = 0;
      new Uint32Array(mem.buffer, argvBufSizePtr, 1)[0] = 0;
      return 0;
    },

    args_get: (argv, argvBuf) => 0,

    clock_time_get: (id, precision, timePtr) => {
      const mem = getMemory();
      const nowMs = (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();
      const nowNs = BigInt(Math.floor(nowMs * 1e6));
      new BigUint64Array(mem.buffer, timePtr, 1)[0] = nowNs;
      return 0;
    },

    clock_res_get: (id, resPtr) => {
      const mem = getMemory();
      new BigUint64Array(mem.buffer, resPtr, 1)[0] = 1000n; // 1 microsecond resolution
      return 0;
    },

    fd_write: (fd, iovs, iovs_len, nwrittenPtr) => {
      const mem = getMemory();
      const view = new DataView(mem.buffer);
      let totalWritten = 0;

      for (let i = 0; i < iovs_len; i++) {
        const ptr = view.getUint32(iovs + i * 8, true);
        const len = view.getUint32(iovs + i * 8 + 4, true);
        const chunk = new Uint8Array(mem.buffer, ptr, len);
        const str = utf8Decoder.decode(chunk);

        if (fd === 1) { // stdout
          stdoutBuffer += str;
          const lines = stdoutBuffer.split('\n');
          stdoutBuffer = lines.pop();
          for (const line of lines) printStdout(line);
        } else if (fd === 2) { // stderr
          stderrBuffer += str;
          const lines = stderrBuffer.split('\n');
          stderrBuffer = lines.pop();
          for (const line of lines) printStderr(line);
        }
        totalWritten += len;
      }

      if (nwrittenPtr !== 0) {
        view.setUint32(nwrittenPtr, totalWritten, true);
      }
      return 0;
    },

    fd_read: (fd, iovs, iovs_len, nreadPtr) => {
      if (nreadPtr !== 0) {
        const mem = getMemory();
        new Uint32Array(mem.buffer, nreadPtr, 1)[0] = 0;
      }
      return 0;
    },

    fd_seek: (fd, offset, whence, newOffsetPtr) => {
      if (newOffsetPtr !== 0) {
        const mem = getMemory();
        new BigUint64Array(mem.buffer, newOffsetPtr, 1)[0] = 0n;
      }
      return 0;
    },

    fd_close: (fd) => 0,
    fd_sync: (fd) => 0,

    fd_fdstat_get: (fd, statPtr) => {
      const mem = getMemory();
      const view = new DataView(mem.buffer, statPtr, 24);
      // fs_filetype: 2 = character device for stdio
      view.setUint8(0, fd <= 2 ? 2 : 4);
      view.setUint16(2, 0, true); // fs_flags
      view.setBigUint64(8, 0xffffffffffffffffn, true); // rights base
      view.setBigUint64(16, 0xffffffffffffffffn, true); // rights inheriting
      return 0;
    },

    fd_fdstat_set_flags: (fd, flags) => 0,
    fd_prestat_get: (fd, buf) => 8, // __WASI_ERRNO_BADF (no preopens)
    fd_prestat_dir_name: (fd, path, path_len) => 8,
    path_open: () => 44, // __WASI_ERRNO_NOENT
    path_filestat_get: () => 44,
    random_get: (buf, buf_len) => {
      const mem = getMemory();
      const u8 = new Uint8Array(mem.buffer, buf, buf_len);
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(u8);
      } else {
        for (let i = 0; i < buf_len; i++) u8[i] = Math.floor(Math.random() * 256);
      }
      return 0;
    },
    sched_yield: () => 0
  };
}


// audio-context.js - Web Audio API host bindings for raylib-wasi
// Supports direct in-thread Web Audio execution and proxying to createAudioReceiver

function createPanNode(ctx) {
  if (typeof ctx.createStereoPanner === 'function') {
    return ctx.createStereoPanner();
  }
  return null;
}

function setPanValue(panNode, pan) {
  if (!panNode) return;
  // Raylib pan: 0.0 (left) .. 0.5 (center) .. 1.0 (right)
  // Web Audio StereoPannerNode: -1.0 (left) .. 0.0 (center) .. 1.0 (right)
  const clampedPan = Math.max(0.0, Math.min(1.0, pan));
  const webPan = (clampedPan - 0.5) * 2.0;
  panNode.pan.setValueAtTime(webPan, panNode.context.currentTime);
}

function pcmToAudioBuffer(ctx, channels, sampleRate, sampleSize, frameCount, data) {
  const audioBuffer = ctx.createBuffer(channels, frameCount, sampleRate);
  const buf = (data && data.buffer) ? data.buffer : data;
  const offset = (data && typeof data.byteOffset === 'number') ? data.byteOffset : 0;

  if (sampleSize === 16) {
    const int16 = new Int16Array(buf, offset, frameCount * channels);
    for (let ch = 0; ch < channels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = int16[i * channels + ch] / 32768.0;
      }
    }
  } else if (sampleSize === 32) {
    const float32 = new Float32Array(buf, offset, frameCount * channels);
    for (let ch = 0; ch < channels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = float32[i * channels + ch];
      }
    }
  } else if (sampleSize === 8) {
    const uint8 = new Uint8Array(buf, offset, frameCount * channels);
    for (let ch = 0; ch < channels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = (uint8[i * channels + ch] - 128) / 128.0;
      }
    }
  }
  return audioBuffer;
}

class AudioStreamQueue {
  constructor(ctx, masterGain, channels, sampleRate, sampleSize) {
    this.ctx = ctx;
    this.masterGain = masterGain;
    this.channels = channels;
    this.sampleRate = sampleRate;
    this.sampleSize = sampleSize;
    this.volume = 1.0;
    this.pitch = 1.0;
    this.pan = 0.5;
    this.isPlaying = false;
    this.isPaused = false;

    this.gainNode = ctx.createGain();
    this.gainNode.gain.setValueAtTime(this.volume, ctx.currentTime);

    this.panNode = createPanNode(ctx);
    if (this.panNode) {
      setPanValue(this.panNode, this.pan);
      this.gainNode.connect(this.panNode);
      this.panNode.connect(masterGain || ctx.destination);
    } else {
      this.gainNode.connect(masterGain || ctx.destination);
    }

    this.nextPlayTime = 0;
    this.scheduledSources = [];
  }

  feedPcm(arrayBuffer, frameCount) {
    if (frameCount <= 0) return;
    const audioBuffer = pcmToAudioBuffer(
      this.ctx,
      this.channels,
      this.sampleRate,
      this.sampleSize,
      frameCount,
      arrayBuffer
    );
    this.feedAudioBuffer(audioBuffer);
  }

  feedAudioBuffer(audioBuffer) {
    if (!this.isPlaying || this.isPaused) return;

    const now = this.ctx.currentTime;
    if (this.nextPlayTime < now) {
      this.nextPlayTime = now + 0.02; // 20ms buffer ahead
    }

    const source = this.ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.setValueAtTime(this.pitch, this.ctx.currentTime);
    source.connect(this.gainNode);

    source.start(this.nextPlayTime);
    this.scheduledSources.push(source);

    const duration = audioBuffer.duration / Math.max(0.01, this.pitch);
    this.nextPlayTime += duration;

    source.onended = () => {
      const idx = this.scheduledSources.indexOf(source);
      if (idx !== -1) this.scheduledSources.splice(idx, 1);
    };
  }

  play() {
    this.isPlaying = true;
    this.isPaused = false;
    this.nextPlayTime = this.ctx.currentTime + 0.02;
  }

  pause() {
    this.isPaused = true;
    this.stopSources();
  }

  resume() {
    if (this.isPaused) {
      this.isPaused = false;
      this.isPlaying = true;
      this.nextPlayTime = this.ctx.currentTime + 0.02;
    }
  }

  stop() {
    this.isPlaying = false;
    this.isPaused = false;
    this.stopSources();
    this.nextPlayTime = 0;
  }

  stopSources() {
    for (const src of this.scheduledSources) {
      try {
        src.stop();
        src.disconnect();
      } catch (_) {}
    }
    this.scheduledSources = [];
  }

  setVolume(vol) {
    this.volume = Math.max(0.0, vol);
    this.gainNode.gain.setValueAtTime(this.volume, this.ctx.currentTime);
  }

  setPitch(pitch) {
    this.pitch = Math.max(0.01, pitch);
    for (const src of this.scheduledSources) {
      src.playbackRate.setValueAtTime(this.pitch, this.ctx.currentTime);
    }
  }

  setPan(pan) {
    this.pan = pan;
    setPanValue(this.panNode, pan);
  }

  destroy() {
    this.stop();
    try {
      this.gainNode.disconnect();
      if (this.panNode) this.panNode.disconnect();
    } catch (_) {}
  }
}

function createAudioImports(getMemory, options = {}) {
  let audioCtx = options.audioContext || null;
  let masterGain = null;
  let masterVolume = 1.0;
  let isReady = false;

  let nextBufferId = 1;
  const buffers = new Map(); // bufferId -> AudioBuffer (direct mode) or metadata (proxy mode)

  let nextVoiceId = 1;
  const voices = new Map(); // voiceId -> voice record

  let nextStreamId = 1;
  const streams = new Map(); // streamId -> AudioStreamQueue

  const useProxy = Boolean(options.onAudioMessage);

  function getAudioContext() {
    if (audioCtx) return audioCtx;
    const AudioContextClass = typeof AudioContext !== 'undefined'
      ? AudioContext
      : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);

    if (AudioContextClass) {
      try {
        audioCtx = new AudioContextClass();
      } catch (_) {}
    }
    return audioCtx;
  }

  function ensureMasterGain() {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (!masterGain) {
      masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(masterVolume, ctx.currentTime);
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  function copyPcmFromWasm(channels, sampleSize, frameCount, dataPtr) {
    const mem = getMemory();
    const totalSamples = frameCount * channels;
    if (sampleSize === 16) {
      const src = new Int16Array(mem.buffer, dataPtr, totalSamples);
      const copy = new Int16Array(totalSamples);
      copy.set(src);
      return copy.buffer;
    } else if (sampleSize === 32) {
      const src = new Float32Array(mem.buffer, dataPtr, totalSamples);
      const copy = new Float32Array(totalSamples);
      copy.set(src);
      return copy.buffer;
    } else if (sampleSize === 8) {
      const src = new Uint8Array(mem.buffer, dataPtr, totalSamples);
      const copy = new Uint8Array(totalSamples);
      copy.set(src);
      return copy.buffer;
    }
    return null;
  }

  return {
    raylib_host_audio_init: () => {
      isReady = true;
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_init' });
        return 0;
      }
      const ctx = getAudioContext();
      if (ctx) {
        ensureMasterGain();
        if (options.onAudioInit) options.onAudioInit();
        return 0;
      }
      return 0; // Return success so C state initializes
    },

    raylib_host_audio_close: () => {
      for (const [id, voice] of voices.entries()) {
        if (voice.source) {
          try { voice.source.stop(); voice.source.disconnect(); } catch (_) {}
        }
      }
      voices.clear();
      buffers.clear();

      for (const [id, stream] of streams.entries()) {
        if (typeof stream.destroy === 'function') stream.destroy();
      }
      streams.clear();

      if (audioCtx) {
        try { audioCtx.close(); } catch (_) {}
        audioCtx = null;
      }
      masterGain = null;
      isReady = false;

      if (useProxy) {
        options.onAudioMessage({ type: 'audio_close' });
      }
    },

    raylib_host_audio_is_ready: () => {
      return isReady ? 1 : 0;
    },

    raylib_host_audio_set_master_volume: (volume) => {
      masterVolume = Math.max(0.0, volume);
      if (masterGain && audioCtx) {
        masterGain.gain.setValueAtTime(masterVolume, audioCtx.currentTime);
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_master_volume', volume: masterVolume });
      }
    },

    raylib_host_audio_get_master_volume: () => {
      return masterVolume;
    },

    // --- Sound Buffer Management ---
    raylib_host_audio_create_buffer: (channels, sampleRate, sampleSize, frameCount, dataPtr) => {
      if (frameCount <= 0 || channels <= 0) return 0;
      const id = nextBufferId++;

      if (useProxy) {
        const pcmBuf = copyPcmFromWasm(channels, sampleSize, frameCount, dataPtr);
        buffers.set(id, {
          channels,
          sampleRate,
          sampleSize,
          frameCount,
          duration: frameCount / sampleRate
        });
        if (pcmBuf) {
          options.onAudioMessage({
            type: 'audio_create_buffer',
            bufferId: id,
            channels,
            sampleRate,
            sampleSize,
            frameCount,
            data: pcmBuf
          }, [pcmBuf]);
        }
        return id;
      }

      const ctx = getAudioContext();
      if (!ctx) {
        // Fallback buffer metadata
        buffers.set(id, { duration: frameCount / sampleRate });
        return id;
      }
      ensureMasterGain();

      try {
        const mem = getMemory();
        const pcmSlice = copyPcmFromWasm(channels, sampleSize, frameCount, dataPtr);
        const audioBuf = pcmToAudioBuffer(ctx, channels, sampleRate, sampleSize, frameCount, pcmSlice);
        buffers.set(id, audioBuf);
        return id;
      } catch (err) {
        console.warn('raylib-wasi: Failed to create audio buffer:', err);
        return 0;
      }
    },

    raylib_host_audio_update_buffer: (bufferId, dataPtr, frameCount) => {
      if (useProxy) {
        const meta = buffers.get(bufferId);
        if (!meta) return;
        const pcmBuf = copyPcmFromWasm(meta.channels, meta.sampleSize, frameCount, dataPtr);
        if (pcmBuf) {
          options.onAudioMessage({
            type: 'audio_update_buffer',
            bufferId,
            frameCount,
            data: pcmBuf
          }, [pcmBuf]);
        }
        return;
      }

      const audioBuf = buffers.get(bufferId);
      const ctx = getAudioContext();
      if (!audioBuf || !ctx || frameCount <= 0 || typeof audioBuf.getChannelData !== 'function') return;

      const channels = audioBuf.numberOfChannels;
      const mem = getMemory();
      const float32 = new Float32Array(mem.buffer, dataPtr, frameCount * channels);
      for (let ch = 0; ch < channels; ch++) {
        const chData = audioBuf.getChannelData(ch);
        const count = Math.min(frameCount, chData.length);
        for (let i = 0; i < count; i++) {
          chData[i] = float32[i * channels + ch];
        }
      }
    },

    raylib_host_audio_destroy_buffer: (bufferId) => {
      buffers.delete(bufferId);
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_destroy_buffer', bufferId });
      }
    },

    // --- Sound Voice Playback Management ---
    raylib_host_audio_play: (bufferId, volume, pitch, pan, loop) => {
      const voiceId = nextVoiceId++;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());

      if (useProxy) {
        const meta = buffers.get(bufferId);
        const dur = meta ? (meta.duration / Math.max(0.01, pitch)) : 1.0;
        voices.set(voiceId, {
          bufferId,
          volume,
          pitch,
          pan,
          loop: Boolean(loop),
          isPlaying: true,
          isPaused: false,
          startTime: now,
          duration: dur
        });
        options.onAudioMessage({
          type: 'audio_play',
          voiceId,
          bufferId,
          volume,
          pitch,
          pan,
          loop: Boolean(loop)
        });
        return voiceId;
      }

      const audioBuf = buffers.get(bufferId);
      const ctx = getAudioContext();
      if (!audioBuf || !ctx || typeof ctx.createBufferSource !== 'function') {
        voices.set(voiceId, { isPlaying: true, isPaused: false, startTime: now, duration: 1.0 });
        return voiceId;
      }
      ensureMasterGain();

      const source = ctx.createBufferSource();
      source.buffer = audioBuf;
      source.loop = Boolean(loop);

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(Math.max(0.0, volume), ctx.currentTime);

      const panNode = createPanNode(ctx);
      if (panNode) {
        setPanValue(panNode, pan);
        source.connect(gainNode);
        gainNode.connect(panNode);
        panNode.connect(masterGain || ctx.destination);
      } else {
        source.connect(gainNode);
        gainNode.connect(masterGain || ctx.destination);
      }

      source.playbackRate.setValueAtTime(Math.max(0.01, pitch), ctx.currentTime);

      const voiceRecord = {
        source,
        gainNode,
        panNode,
        bufferId,
        volume,
        pitch,
        pan,
        loop: Boolean(loop),
        isPlaying: true,
        isPaused: false,
        startTime: ctx.currentTime,
        pausedAt: 0,
        duration: audioBuf.duration / Math.max(0.01, pitch)
      };

      source.onended = () => {
        voiceRecord.isPlaying = false;
        voiceRecord.isPaused = false;
        voices.delete(voiceId);
      };

      source.start(0);
      voices.set(voiceId, voiceRecord);
      return voiceId;
    },

    raylib_host_audio_stop: (voiceId) => {
      const voice = voices.get(voiceId);
      if (voice) {
        if (voice.source) {
          voice.source.onended = null;
          try { voice.source.stop(); voice.source.disconnect(); } catch (_) {}
        }
        voice.isPlaying = false;
        voice.isPaused = false;
        voices.delete(voiceId);
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stop', voiceId });
      }
    },

    raylib_host_audio_pause: (voiceId) => {
      const voice = voices.get(voiceId);
      if (!voice || !voice.isPlaying || voice.isPaused) return;

      if (useProxy) {
        voice.isPaused = true;
        options.onAudioMessage({ type: 'audio_pause', voiceId });
        return;
      }

      const ctx = getAudioContext();
      voice.pausedAt = (ctx.currentTime - voice.startTime) * voice.pitch;
      voice.isPaused = true;
      if (voice.source) {
        voice.source.onended = null;
        try { voice.source.stop(); } catch (_) {}
      }
    },

    raylib_host_audio_resume: (voiceId) => {
      const voice = voices.get(voiceId);
      if (!voice || !voice.isPaused) return;

      if (useProxy) {
        voice.isPaused = false;
        voice.startTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        options.onAudioMessage({ type: 'audio_resume', voiceId });
        return;
      }

      const ctx = getAudioContext();
      const audioBuf = buffers.get(voice.bufferId);
      if (!ctx || !audioBuf) return;

      const source = ctx.createBufferSource();
      source.buffer = audioBuf;
      source.loop = voice.loop;
      source.playbackRate.setValueAtTime(voice.pitch, ctx.currentTime);
      source.connect(voice.gainNode);

      source.onended = () => {
        voice.isPlaying = false;
        voice.isPaused = false;
        voices.delete(voiceId);
      };

      const offset = (voice.pausedAt || 0) % (audioBuf.duration || 1);
      source.start(0, offset);
      voice.source = source;
      voice.startTime = ctx.currentTime - (offset / Math.max(0.01, voice.pitch));
      voice.isPaused = false;
      voice.isPlaying = true;
    },

    raylib_host_audio_is_playing: (voiceId) => {
      const voice = voices.get(voiceId);
      if (!voice || !voice.isPlaying || voice.isPaused) return 0;
      if (useProxy) {
        if (!voice.loop) {
          const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
          if (now - voice.startTime >= (voice.duration * 1000)) {
            voice.isPlaying = false;
            voices.delete(voiceId);
            return 0;
          }
        }
        return 1;
      }
      return (voice.isPlaying && !voice.isPaused) ? 1 : 0;
    },

    raylib_host_audio_set_volume: (voiceId, volume) => {
      const voice = voices.get(voiceId);
      if (voice) {
        voice.volume = Math.max(0.0, volume);
        if (voice.gainNode && audioCtx) {
          voice.gainNode.gain.setValueAtTime(voice.volume, audioCtx.currentTime);
        }
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_set_volume', voiceId, volume });
      }
    },

    raylib_host_audio_set_pitch: (voiceId, pitch) => {
      const voice = voices.get(voiceId);
      if (voice) {
        voice.pitch = Math.max(0.01, pitch);
        if (voice.source && audioCtx) {
          voice.source.playbackRate.setValueAtTime(voice.pitch, audioCtx.currentTime);
        }
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_set_pitch', voiceId, pitch });
      }
    },

    raylib_host_audio_set_pan: (voiceId, pan) => {
      const voice = voices.get(voiceId);
      if (voice) {
        voice.pan = pan;
        if (voice.panNode) setPanValue(voice.panNode, pan);
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_set_pan', voiceId, pan });
      }
    },

    // --- AudioStream Management ---
    raylib_host_audio_stream_init: (channels, sampleRate, sampleSize) => {
      const streamId = nextStreamId++;
      if (useProxy) {
        streams.set(streamId, { channels, sampleRate, sampleSize, isPlaying: false, isPaused: false });
        options.onAudioMessage({ type: 'audio_stream_init', streamId, channels, sampleRate, sampleSize });
        return streamId;
      }

      const ctx = getAudioContext();
      if (!ctx) return streamId;
      ensureMasterGain();

      const stream = new AudioStreamQueue(ctx, masterGain, channels, sampleRate, sampleSize);
      streams.set(streamId, stream);
      return streamId;
    },

    raylib_host_audio_stream_destroy: (streamId) => {
      const stream = streams.get(streamId);
      if (stream && typeof stream.destroy === 'function') stream.destroy();
      streams.delete(streamId);
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stream_destroy', streamId });
      }
    },

    raylib_host_audio_stream_feed: (streamId, dataPtr, frameCount) => {
      const stream = streams.get(streamId);
      if (!stream) return;

      if (useProxy) {
        const pcmBuf = copyPcmFromWasm(stream.channels, stream.sampleSize, frameCount, dataPtr);
        if (pcmBuf) {
          options.onAudioMessage({
            type: 'audio_stream_feed',
            streamId,
            frameCount,
            data: pcmBuf
          }, [pcmBuf]);
        }
        return;
      }

      const mem = getMemory();
      const pcmSlice = copyPcmFromWasm(stream.channels, stream.sampleSize, frameCount, dataPtr);
      stream.feedPcm(pcmSlice, frameCount);
    },

    raylib_host_audio_stream_play: (streamId) => {
      const stream = streams.get(streamId);
      if (stream) {
        stream.isPlaying = true;
        stream.isPaused = false;
        if (typeof stream.play === 'function') stream.play();
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stream_play', streamId });
      }
    },

    raylib_host_audio_stream_pause: (streamId) => {
      const stream = streams.get(streamId);
      if (stream) {
        stream.isPaused = true;
        if (typeof stream.pause === 'function') stream.pause();
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stream_pause', streamId });
      }
    },

    raylib_host_audio_stream_resume: (streamId) => {
      const stream = streams.get(streamId);
      if (stream) {
        stream.isPaused = false;
        stream.isPlaying = true;
        if (typeof stream.resume === 'function') stream.resume();
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stream_resume', streamId });
      }
    },

    raylib_host_audio_stream_stop: (streamId) => {
      const stream = streams.get(streamId);
      if (stream) {
        stream.isPlaying = false;
        stream.isPaused = false;
        if (typeof stream.stop === 'function') stream.stop();
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stream_stop', streamId });
      }
    },

    raylib_host_audio_stream_is_playing: (streamId) => {
      const stream = streams.get(streamId);
      return (stream && stream.isPlaying && !stream.isPaused) ? 1 : 0;
    },

    raylib_host_audio_stream_set_volume: (streamId, volume) => {
      const stream = streams.get(streamId);
      if (stream && typeof stream.setVolume === 'function') stream.setVolume(volume);
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stream_set_volume', streamId, volume });
      }
    },

    raylib_host_audio_stream_set_pitch: (streamId, pitch) => {
      const stream = streams.get(streamId);
      if (stream && typeof stream.setPitch === 'function') stream.setPitch(pitch);
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stream_set_pitch', streamId, pitch });
      }
    },

    raylib_host_audio_stream_set_pan: (streamId, pan) => {
      const stream = streams.get(streamId);
      if (stream && typeof stream.setPan === 'function') stream.setPan(pan);
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stream_set_pan', streamId, pan });
      }
    }
  };
}

// Standalone receiver for main threads receiving audio messages from workers
function createAudioReceiver(options = {}) {
  const AudioContextClass = typeof AudioContext !== 'undefined'
    ? AudioContext
    : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);

  let ctx = options.audioContext || null;
  let masterGain = null;
  const buffers = new Map();
  const voices = new Map();
  const streams = new Map();

  function getContext() {
    if (!ctx && AudioContextClass) {
      try {
        ctx = new AudioContextClass();
        masterGain = ctx.createGain();
        masterGain.connect(ctx.destination);
      } catch (err) {
        console.warn('raylib-wasi createAudioReceiver: AudioContext creation failed:', err);
      }
    }
    if (ctx && !masterGain) {
      masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  return {
    handleMessage: (msg) => {
      if (!msg || !msg.type) return;
      const c = getContext();

      switch (msg.type) {
        case 'audio_init': {
          getContext();
          break;
        }

        case 'audio_close': {
          for (const [id, voice] of voices.entries()) {
            try { voice.source.stop(); voice.source.disconnect(); } catch (_) {}
          }
          voices.clear();
          buffers.clear();
          for (const [id, stream] of streams.entries()) {
            stream.destroy();
          }
          streams.clear();
          if (ctx) {
            try { ctx.close(); } catch (_) {}
            ctx = null;
            masterGain = null;
          }
          break;
        }

        case 'audio_master_volume': {
          if (masterGain && c) {
            masterGain.gain.setValueAtTime(Math.max(0.0, msg.volume), c.currentTime);
          }
          break;
        }

        case 'audio_create_buffer': {
          if (!c) return;
          try {
            const audioBuf = pcmToAudioBuffer(
              c,
              msg.channels,
              msg.sampleRate,
              msg.sampleSize,
              msg.frameCount,
              msg.data
            );
            buffers.set(msg.bufferId, audioBuf);
          } catch (err) {
            console.warn('createAudioReceiver: failed to create buffer:', err);
          }
          break;
        }

        case 'audio_update_buffer': {
          const audioBuf = buffers.get(msg.bufferId);
          if (!audioBuf) return;
          const float32 = new Float32Array(msg.data);
          const chCount = audioBuf.numberOfChannels;
          for (let ch = 0; ch < chCount; ch++) {
            const chData = audioBuf.getChannelData(ch);
            const count = Math.min(msg.frameCount, chData.length);
            for (let i = 0; i < count; i++) {
              chData[i] = float32[i * chCount + ch];
            }
          }
          break;
        }

        case 'audio_destroy_buffer': {
          buffers.delete(msg.bufferId);
          break;
        }

        case 'audio_play': {
          if (!c) return;
          const audioBuf = buffers.get(msg.bufferId);
          if (!audioBuf) {
            console.warn('createAudioReceiver: audio buffer not found:', msg.bufferId);
            return;
          }

          const source = c.createBufferSource();
          source.buffer = audioBuf;
          source.loop = Boolean(msg.loop);

          const gainNode = c.createGain();
          gainNode.gain.setValueAtTime(Math.max(0.0, msg.volume), c.currentTime);

          const panNode = createPanNode(c);
          if (panNode) {
            setPanValue(panNode, msg.pan);
            source.connect(gainNode);
            gainNode.connect(panNode);
            panNode.connect(masterGain || c.destination);
          } else {
            source.connect(gainNode);
            gainNode.connect(masterGain || c.destination);
          }

          source.playbackRate.setValueAtTime(Math.max(0.01, msg.pitch), c.currentTime);

          const voiceRecord = {
            source,
            gainNode,
            panNode,
            bufferId: msg.bufferId,
            volume: msg.volume,
            pitch: msg.pitch,
            pan: msg.pan,
            loop: Boolean(msg.loop),
            startTime: c.currentTime,
            pausedAt: 0
          };

          source.onended = () => {
            voices.delete(msg.voiceId);
          };

          source.start(0);
          voices.set(msg.voiceId, voiceRecord);
          break;
        }

        case 'audio_stop': {
          const voice = voices.get(msg.voiceId);
          if (voice) {
            voice.source.onended = null;
            try { voice.source.stop(); voice.source.disconnect(); } catch (_) {}
            voices.delete(msg.voiceId);
          }
          break;
        }

        case 'audio_pause': {
          const voice = voices.get(msg.voiceId);
          if (!voice || !c) return;
          voice.pausedAt = (c.currentTime - voice.startTime) * voice.pitch;
          voice.isPaused = true;
          voice.source.onended = null;
          try { voice.source.stop(); } catch (_) {}
          break;
        }

        case 'audio_resume': {
          const voice = voices.get(msg.voiceId);
          if (!voice || !c) return;
          const audioBuf = buffers.get(voice.bufferId);
          if (!audioBuf) return;

          const source = c.createBufferSource();
          source.buffer = audioBuf;
          source.loop = voice.loop;
          source.playbackRate.setValueAtTime(voice.pitch, c.currentTime);
          source.connect(voice.gainNode);

          source.onended = () => {
            voices.delete(msg.voiceId);
          };

          const offset = (voice.pausedAt || 0) % (audioBuf.duration || 1);
          source.start(0, offset);
          voice.source = source;
          voice.startTime = c.currentTime - (offset / Math.max(0.01, voice.pitch));
          voice.isPaused = false;
          break;
        }

        case 'audio_set_volume': {
          const voice = voices.get(msg.voiceId);
          if (voice && c) {
            voice.volume = Math.max(0.0, msg.volume);
            voice.gainNode.gain.setValueAtTime(voice.volume, c.currentTime);
          }
          break;
        }

        case 'audio_set_pitch': {
          const voice = voices.get(msg.voiceId);
          if (voice && c) {
            voice.pitch = Math.max(0.01, msg.pitch);
            voice.source.playbackRate.setValueAtTime(voice.pitch, c.currentTime);
          }
          break;
        }

        case 'audio_set_pan': {
          const voice = voices.get(msg.voiceId);
          if (voice) {
            voice.pan = msg.pan;
            if (voice.panNode) setPanValue(voice.panNode, msg.pan);
          }
          break;
        }

        case 'audio_stream_init': {
          if (!c) return;
          const stream = new AudioStreamQueue(c, masterGain, msg.channels, msg.sampleRate, msg.sampleSize);
          streams.set(msg.streamId, stream);
          break;
        }

        case 'audio_stream_feed': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.feedPcm(msg.data, msg.frameCount);
          break;
        }

        case 'audio_stream_play': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.play();
          break;
        }

        case 'audio_stream_pause': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.pause();
          break;
        }

        case 'audio_stream_resume': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.resume();
          break;
        }

        case 'audio_stream_stop': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.stop();
          break;
        }

        case 'audio_stream_destroy': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.destroy();
          streams.delete(msg.streamId);
          break;
        }

        case 'audio_stream_set_volume': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.setVolume(msg.volume);
          break;
        }

        case 'audio_stream_set_pitch': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.setPitch(msg.pitch);
          break;
        }

        case 'audio_stream_set_pan': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.setPan(msg.pan);
          break;
        }
      }
    },
    getContext: () => getContext(),
    resume: () => {
      const c = getContext();
      if (c && c.state === 'suspended') {
        return c.resume();
      }
      return Promise.resolve();
    },
    getState: () => {
      const c = getContext();
      return c ? c.state : 'uninitialized';
    }
  };
}


// index.js - raylib-wasi Host Bridge entry point






function createRaylibHost(options = {}) {
  let memory = null;
  const getMemory = () => {
    if (!memory) throw new Error('WebAssembly memory not bound. Call host.setMemory(instance.exports.memory) or host.setInstance(instance)');
    return memory;
  };

  const utf8Decoder = new TextDecoder('utf-8');
  function decodeString(ptr) {
    if (ptr === 0) return '';
    const mem = getMemory();
    const u8 = new Uint8Array(mem.buffer, ptr);
    let end = 0;
    while (u8[end] !== 0) end++;
    return utf8Decoder.decode(new Uint8Array(mem.buffer, ptr, end));
  }

  // Initialize Canvas & WebGL Context
  let canvas = options.canvas || null;
  let gl = options.gl || null;
  if (!gl) {
    if (!canvas && typeof OffscreenCanvas !== 'undefined') {
      const w = options.width || 800;
      const h = options.height || 450;
      canvas = new OffscreenCanvas(w, h);
    }
    if (canvas && typeof canvas.getContext === 'function') {
      gl = canvas.getContext('webgl', {
        alpha: false,
        depth: true,
        stencil: true,
        antialias: true,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false
      });
    }
  }

  // Create sub-modules
  const input = options.inputCoordinator || options.input || new InputCoordinator({
    canvas,
    sharedBuffer: options.sharedBuffer || null,
    width: options.width || (canvas ? canvas.width : 800),
    height: options.height || (canvas ? canvas.height : 450),
    dpiScale: options.dpiScale || (typeof window !== 'undefined' ? window.devicePixelRatio : 1.0)
  });

  const glImports = gl ? createGLImports(gl, getMemory) : {};
  const wasiImports = createWasiImports(getMemory, options);
  const audioImports = createAudioImports(getMemory, options);

  let lastFpsTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let frameCount = 0;

  const raylibImports = {
    raylib_host_init_window: (width, height, titlePtr) => {
      const title = decodeString(titlePtr);
      if (canvas) {
        canvas.width = width;
        canvas.height = height;
      }
      input.windowWidth = width;
      input.windowHeight = height;
      input.renderWidth = width;
      input.renderHeight = height;
      input.shouldClose = false;
      input.updateSharedState();
      lastFpsTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      frameCount = 0;
      if (typeof document !== 'undefined' && title) {
        document.title = title;
      }
      if (options.onInitWindow) {
        options.onInitWindow(width, height, title);
      }
      return 0;
    },

    raylib_host_close_window: () => {
      input.shouldClose = true;
      input.updateSharedState();
      if (options.onClose) options.onClose();
    },

    raylib_host_swap_buffers: () => {
      let bitmap = null;
      if (canvas && typeof canvas.transferToImageBitmap === 'function') {
        try {
          bitmap = canvas.transferToImageBitmap();
        } catch (_) {
          // Ignore if placeholder canvas or detached
        }
      }

      if (options.onFrame) {
        options.onFrame(bitmap);
      } else if (bitmap && typeof self !== 'undefined' && typeof self.postMessage === 'function') {
        self.postMessage({ type: 'frame', bitmap }, [bitmap]);
      }

      // Track and emit FPS
      frameCount++;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (now - lastFpsTime >= 1000) {
        const fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
        if (options.onFPS) {
          options.onFPS(fps);
        } else if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
          self.postMessage({ type: 'fps', fps });
        }
        frameCount = 0;
        lastFpsTime = now;
      }

      // Legacy OffscreenCanvas commit if available
      if (gl && gl.commit) gl.commit();
    },

    raylib_host_poll_input: (statePtr) => {
      input.pollToWasm(statePtr, getMemory());
    },

    raylib_host_sleep: (ms) => {
      if (ms <= 0) return;
      if (input.syncWord) {
        // Synchronous frame delay via Atomics.wait on SharedArrayBuffer in Web Worker
        Atomics.wait(input.syncWord, 0, 0, Math.max(1, Math.round(ms)));
      } else if (typeof Atomics !== 'undefined' && options.sharedBuffer) {
        const sync = new Int32Array(options.sharedBuffer, 372, 1);
        Atomics.wait(sync, 0, 0, Math.max(1, Math.round(ms)));
      }
    },

    raylib_host_set_title: (titlePtr) => {
      const title = decodeString(titlePtr);
      if (typeof document !== 'undefined' && title) {
        document.title = title;
      }
    },

    raylib_host_open_url: (urlPtr) => {
      const url = decodeString(urlPtr);
      if (typeof window !== 'undefined' && url) {
        window.open(url, '_blank');
      }
    }
  };

  const combinedRaylibImports = Object.assign({}, raylibImports, audioImports);

  const host = {
    input,
    gl,
    audio: audioImports,
    getImports: () => ({
      gl: glImports,
      raylib: combinedRaylibImports,
      audio: audioImports,
      wasi_snapshot_preview1: wasiImports
    }),
    setMemory: (mem) => { memory = mem; },
    setInstance: (inst) => {
      memory = inst.exports.memory;
    },
    run: async (wasmBinary) => {
      const imports = host.getImports();
      const { instance } = await WebAssembly.instantiate(wasmBinary, imports);
      host.setInstance(instance);
      if (instance.exports._start) {
        instance.exports._start();
      } else if (instance.exports.main) {
        instance.exports.main();
      }
      return instance;
    }
  };

  return host;
}

class RaylibReferenceHost {
  constructor(options = {}) {
    this.options = Object.assign({}, options);
    this.stats = {
      framesRendered: 0,
      drawCalls: 0,
      audioBuffersCreated: 0,
      audioVoicesPlayed: 0,
      audioStreamsInitialized: 0,
      audioStreamChunksFed: 0
    };

    this.stdoutLines = [];
    this.stderrLines = [];
    this.exitCode = null;

    this.glStats = {};
    this.gl = this.options.gl || createMockGL(this.glStats);

    this.audioMessages = [];
    const userAudioMsgHandler = this.options.onAudioMessage;
    const trackingAudioMsgHandler = (msg, transfer) => {
      this.audioMessages.push(msg);
      if (msg.type === 'audio_create_buffer') this.stats.audioBuffersCreated++;
      if (msg.type === 'audio_play') this.stats.audioVoicesPlayed++;
      if (msg.type === 'audio_stream_init') this.stats.audioStreamsInitialized++;
      if (msg.type === 'audio_stream_feed') this.stats.audioStreamChunksFed++;
      if (userAudioMsgHandler) userAudioMsgHandler(msg, transfer);
    };

    this.host = createRaylibHost({
      gl: this.gl,
      width: this.options.width || 800,
      height: this.options.height || 450,
      sharedBuffer: this.options.sharedBuffer || null,
      onAudioMessage: trackingAudioMsgHandler,
      print: (text) => {
        this.stdoutLines.push(text);
        if (this.options.print) this.options.print(text);
      },
      printErr: (text) => {
        this.stderrLines.push(text);
        if (this.options.printErr) this.options.printErr(text);
      },
      onExit: (code) => {
        this.exitCode = code;
        if (this.options.onExit) this.options.onExit(code);
      },
      onFrame: (bitmap) => {
        this.stats.framesRendered++;
        this.stats.drawCalls = (this.glStats.drawArraysCount || 0) + (this.glStats.drawElementsCount || 0);

        if (this.options.onFrame) {
          this.options.onFrame(this.stats.framesRendered, this);
        }

        if (this.options.maxFrames && this.stats.framesRendered >= this.options.maxFrames) {
          this.requestClose();
        }
      }
    });

    this.input = this.host.input;
  }

  pressKey(keyCode) {
    if (keyCode >= 0 && keyCode < 512) {
      const word = Math.floor(keyCode / 32);
      const bit = keyCode % 32;
      this.input.keysDown[word] |= (1 << bit);
      this.input.keyPressedQueue.push(keyCode);
      this.input.updateSharedState();
    }
  }

  releaseKey(keyCode) {
    if (keyCode >= 0 && keyCode < 512) {
      const word = Math.floor(keyCode / 32);
      const bit = keyCode % 32;
      this.input.keysDown[word] &= ~(1 << bit);
      this.input.updateSharedState();
    }
  }

  setMousePosition(x, y) {
    this.input.mouseX = x;
    this.input.mouseY = y;
    this.input.updateSharedState();
  }

  pressMouseButton(button = 0) {
    this.input.mouseButtons |= (1 << button);
    this.input.updateSharedState();
  }

  releaseMouseButton(button = 0) {
    this.input.mouseButtons &= ~(1 << button);
    this.input.updateSharedState();
  }

  requestClose() {
    this.input.shouldClose = true;
    this.input.updateSharedState();
  }

  async run(wasmBinary, runtimeOptions = {}) {
    if (typeof wasmBinary === 'string') {
      const { readFileSync } = await import('node:fs');
      wasmBinary = readFileSync(wasmBinary);
    }
    if (runtimeOptions.maxFrames) {
      this.options.maxFrames = runtimeOptions.maxFrames;
    }

    try {
      await this.host.run(wasmBinary);
      if (this.exitCode === null) {
        this.exitCode = 0;
      }
    } catch (err) {
      if (typeof err.exitCode === 'number') {
        this.exitCode = err.exitCode;
      } else {
        throw err;
      }
    }

    return {
      exitCode: this.exitCode,
      framesRendered: this.stats.framesRendered,
      drawCalls: this.stats.drawCalls,
      clearCount: this.glStats.clearCount || 0,
      stdoutLines: this.stdoutLines,
      stderrLines: this.stderrLines,
      audioMessages: this.audioMessages
    };
  }
}




export { createGLImports, createMockGL, InputCoordinator, createWasiImports, createAudioImports, createAudioReceiver, createRaylibHost, RaylibReferenceHost };
export default createRaylibHost;
