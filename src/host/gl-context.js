// gl-context.js - WebGL ES 2.0 Host State Machine and Handle Table

export function createGLImports(gl, getMemory) {
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
