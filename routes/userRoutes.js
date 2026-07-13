import express from 'express';
import passport from 'passport';
import multer from 'multer';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { User, Invitado, Colab, Admin, Cliente } from '../models/user.js';
import Documento from '../models/documento.js'; 

const router = express.Router();

// Variable de control para evitar bucles infinitos durante el logout en desarrollo
let logoutTemporalDesarrollo = false;

// =========================================================================
// CONFIGURACIÓN DE MULTER
// =========================================================================
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos en formato PDF'), false);
    }
  }
});

// =========================================================================
// 1. CONFIGURACIÓN DE PASSPORT GOOGLE STRATEGY
// =========================================================================
const googleVerify = async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;
    if (!email) return done(new Error("No se pudo obtener el correo"), null);

    let user = await User.findOne({ correo: email });

    if (!user) {
      user = new Invitado({
        googleId: profile.id,
        nombre: profile.displayName,
        correo: email,
        rol: 'INVITADO',
        estado: 'APROBADO',
        region_tramite: 'No especificada',
        comuna_tramite: 'No especificada',
        constitucion_legal: 4,
        giro_empresa_codigo: 0, 
        situacion_sii: 1,
        patente_primaria: 'PENDIENTE',
        patente_secundaria: ''
      });
      await user.save();
    }
    return done(null, user);
  } catch (error) {
    return done(error, null);
  }
};

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || "203058244125-vfh9eugdb4q9ecsdqbs81u4sjdq9p318.apps.googleusercontent.com",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "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",
    callbackURL: "https://tupatente-backend.onrender.com/api/users/auth/google/callback"
  },
  googleVerify
));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// =========================================================================
// 2. RUTAS DE AUTENTICACIÓN Y SESIÓN (GOOGLE & GENERAL)
// =========================================================================

router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login-error' }),
  (req, res) => { 
    logoutTemporalDesarrollo = false; 
    const user = req.user;
    const base = "https://tupatente-backend.onrender.com";

    if (user.rol === 'INVITADO') {
      const comuna = user.comuna_tramite;
      if (!comuna || comuna.trim() === "" || comuna === "No especificada") {
        return res.redirect(`${base}/formulario.html`); 
      } else {
        return res.redirect(`${base}/dashboard.html`); 
      }
    }

    if (user.rol === 'CLIENTE') return res.redirect(`${base}/panel_cliente.html`);
    else if (user.rol === 'ADMIN') return res.redirect(`${base}/admin_panel.html`);
    
    res.redirect(`${base}/dashboard.html`); 
  }
);

router.get('/perfil-actual', async (req, res) => {
  if (req.user) { 
    logoutTemporalDesarrollo = false; 
    return res.status(200).json({ success: true, usuario: req.user }); 
  } 
  if (logoutTemporalDesarrollo) {
    return res.status(401).json({ success: false, mensaje: 'Sesión cerrada explícitamente por el usuario.' });
  }
  try {
    const usuarioRespaldo = await Invitado.findOne({ rol: 'INVITADO' }).sort({ updatedAt: -1 });
    if (usuarioRespaldo) return res.status(200).json({ success: true, usuario: usuarioRespaldo });
  } catch (error) { console.error("Error BD:", error); }
  res.status(401).json({ success: false, mensaje: 'Sin sesión activa.' }); 
});

router.get('/auth/logout', (req, res) => {
    // req.logout() elimina al usuario de la sesión de Passport
    // pero MANTIENE la sesión viva en el servidor.
    req.logout((err) => {
        if (err) {
            return res.status(500).json({ success: false, mensaje: "Error al cerrar sesión" });
        }
        
        // NO llamamos a req.session.destroy() aquí.
        // Solo respondemos éxito.
        res.json({ success: true, mensaje: "Sesión de usuario cerrada, sesión de admin intacta" });
    });
});

router.get('/admin/colaboradores-todos', async (req, res) => {
    try {
        const colabs = await Colab.find({})
            .populate('clientes_activos', 'nombre')
            .populate('clientes_completados', 'nombre');
        res.status(200).json({ success: true, colaboradores: colabs });
    } catch (error) {
        res.status(500).json({ success: false, mensaje: 'Error al obtener colaboradores' });
    }
});

router.get('/clientes-cobertura', async (req, res) => {
    try {
        if (!req.user || req.user.rol !== 'COLAB') return res.status(403).json({ mensaje: 'No autorizado' });
        const disponibles = await Cliente.find({
            'lugar_act.comuna': { $in: req.user.rango_act_comuna },
            $or: [ { colab_activo: { $ne: true } }, { colab_activo: { $exists: false } } ]
        });
        const misClientes = await Cliente.find({ colab_assigned: req.user._id });
        res.status(200).json({ disponibles, misClientes });
    } catch (error) {
        res.status(500).json({ success: false, mensaje: 'Error al obtener clientes' });
    }
});

router.get('/admin/documento/:id', async (req, res) => {
    try {
        const doc = await Documento.findById(req.params.id);
        if (!doc || !doc.pdfArchivo) return res.status(404).json({ success: false, mensaje: "Documento no encontrado o vacío" });
        const buffer = Buffer.isBuffer(doc.pdfArchivo) ? doc.pdfArchivo : Buffer.from(doc.pdfArchivo.buffer || doc.pdfArchivo);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="antecedentes.pdf"');
        res.setHeader('Content-Length', buffer.length);
        return res.send(buffer);
    } catch (error) {
        res.status(500).json({ success: false, mensaje: "Error interno" });
    }
});

router.get('/admin/clientes-todos', async (req, res) => {
    try {
        const clientes = await Cliente.find({}); 
        res.status(200).json({ success: true, clientes });
    } catch (error) {
        res.status(500).json({ success: false, mensaje: 'Error al obtener clientes' });
    }
});

router.post('/admin/cambiar-estado', async (req, res) => {
    try {
        const { id, estado } = req.body;
        await Colab.findByIdAndUpdate(id, { estado: estado });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

// =========================================================================
// 3. RUTAS LOCALES: LOGIN, REGISTRO Y ASISTENTE
// =========================================================================

router.post('/registrar_local', async (req, res) => {
  try {
    const { nombre, correo, password } = req.body;
    if (!nombre || !correo || !password) return res.status(400).json({ success: false, mensaje: 'Campos obligatorios.' });
    
    const emailFormateado = correo.toLowerCase().trim();
    const usuarioExistente = await Invitado.findOne({ correo: emailFormateado });
    if (usuarioExistente) return res.status(400).json({ success: false, mensaje: 'Correo ya registrado.' });
    
    const nuevoUsuario = new Invitado({
      nombre: nombre.trim(),
      correo: emailFormateado,
      password: password, 
      rol: 'INVITADO',
      estado: 'APROBADO',
      region_tramite: 'No especificada',
      comuna_tramite: 'No especificada',
      constitucion_legal: 4,
      giro_empresa_codigo: 0, 
      situacion_sii: 1,
      patente_primaria: 'PENDIENTE',
      patente_secundaria: ''
    });
    
    await nuevoUsuario.save();
    res.status(200).json({ success: true, mensaje: 'Usuario registrado exitosamente.' });
  } catch (error) {
    res.status(500).json({ success: false, mensaje: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { correo, password } = req.body;
    if (!correo || !password) return res.status(400).json({ success: false, mensaje: 'Credenciales obligatorias.' });
    
    const emailFormateado = correo.toLowerCase().trim();
    const usuario = await User.findOne({ correo: emailFormateado });
    
    if (!usuario) return res.status(401).json({ success: false, mensaje: 'Usuario no encontrado.' });
    if (usuario.rol !== 'ADMIN' && usuario.rol !== 'COLAB') return res.status(403).json({ success: false, mensaje: 'Sin permisos.' });
    if (usuario.password !== password) return res.status(401).json({ success: false, mensaje: 'Contraseña incorrecta.' });

    req.login(usuario, (err) => {
      if (err) return res.status(500).json({ success: false, mensaje: 'Error de sesión.' });
      return res.status(200).json({
        success: true,
        redirectUrl: usuario.rol === 'ADMIN' ? 'panel_admin.html' : 'panel_colab.html',
        usuario: { id: usuario._id, nombre: usuario.nombre, rol: usuario.rol }
      });
    });
  } catch (error) { res.status(500).json({ success: false, mensaje: 'Error interno.' }); }
});

router.post('/crear_invitado', async (req, res) => {
  try {
    const { nombre, correo, region_tramite, comuna_tramite, tipo_tramite_comuna, constitucion_legal, giro_empresa_codigo, situacion_sii, patente_primaria, patente_secundaria } = req.body;
    
    if (!correo) return res.status(400).json({ success: false, mensaje: 'El campo correo es obligatorio.' });
    const emailFormateado = correo.toLowerCase().trim();
    
    let regionLimpia = 'No especificada';
    if (region_tramite) regionLimpia = region_tramite.replace(/Región de\s+/i, '').replace(/Región\s+/i, '').trim();
    
    let usuario = await Invitado.findOne({ correo: emailFormateado });
    const datosDiagnostico = {
      nombre: nombre || 'Usuario Invitado', correo: emailFormateado, rol: 'INVITADO', estado: 'APROBADO',
      region_tramite: regionLimpia, comuna_tramite: comuna_tramite || 'No especificada', 
      tipo_tramite_comuna: Number(tipo_tramite_comuna) || 0, constitucion_legal: Number(constitucion_legal) || 4,
      giro_empresa_codigo: Number(giro_empresa_codigo) || 0, situacion_sii: Number(situacion_sii) || 1,
      patente_primaria: patente_primaria || 'PENDIENTE', patente_secundaria: patente_secundaria || ''
    };

    if (!usuario) {
      usuario = new Invitado(datosDiagnostico);
    } else {
      Object.assign(usuario, datosDiagnostico);
      usuario.set('pasos_completos', undefined);
    }
    const usuarioGuardado = await usuario.save();
    res.status(200).json({ success: true, usuario: usuarioGuardado });
  } catch (error) { res.status(400).json({ success: false, mensaje: error.message }); }
});

router.post('/crear-admin', async (req, res) => {
    try {
        const nuevoAdmin = new Admin({ ...req.body, rol: 'ADMIN', estado: 'APROBADO' });
        await nuevoAdmin.save();
        res.status(201).json({ success: true });
    } catch (error) { res.status(400).json({ success: false }); }
});

router.post('/login-usuario', async (req, res) => {
  try {
    const { correo, password } = req.body;
    if (!correo || !password) return res.status(400).json({ success: false, mensaje: 'Credenciales incompletas.' });
    
    const usuario = await User.findOne({ correo: correo.toLowerCase().trim() });
    if (!usuario) return res.status(401).json({ success: false, mensaje: 'Usuario no encontrado.' });
    if (usuario.rol === 'ADMIN' || usuario.rol === 'COLAB') return res.status(403).json({ success: false, mensaje: 'Acceso no permitido.' });
    if (usuario.password !== password) return res.status(401).json({ success: false, mensaje: 'Contraseña incorrecta.' });

    req.login(usuario, (err) => {
      if (err) return res.status(500).json({ success: false, mensaje: 'Error de sesión.' });
      return res.status(200).json({ success: true, usuario: { id: usuario._id, nombre: usuario.nombre, rol: usuario.rol, comuna_tramite: usuario.comuna_tramite || null } });
    });
  } catch (error) { res.status(500).json({ success: false, mensaje: 'Error interno.' }); }
});

// =========================================================================
// 4. ACTUALIZAR O TRANSMUTAR ROL A CLIENTE (RESTABLECIDO AL ORIGINAL)
// =========================================================================
router.put('/actualizar-a-cliente', upload.fields([{ name: 'file_propietario', maxCount: 1 }, { name: 'file_antecedentes', maxCount: 1 }]), async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, mensaje: 'No hay una sesión activa.' });

    const { rut, telefono, edad, profesion, residencia, lugar_direccion, lugar_region, lugar_comuna, lugar_apta_Act } = req.body;
    
    if (!req.files || !req.files['file_propietario']) {
      return res.status(400).json({ success: false, mensaje: 'El archivo de Acreditación (PDF) es obligatorio.' });
    }

    const archivoPropietarioObj = req.files['file_propietario'][0];
    const nuevoDocPropietario = new Documento({
      titulo: `Acreditación Propiedad - ${rut}`,
      pdfArchivo: archivoPropietarioObj.buffer, 
      pdfNombre: archivoPropietarioObj.originalname,
      pdfContentType: archivoPropietarioObj.mimetype
    });
    const docPropietarioGuardado = await nuevoDocPropietario.save();

    let idAntecedentes = null;
    if (req.files && req.files['file_antecedentes']) {
        const archivoAntecedentesObj = req.files['file_antecedentes'][0];
        const nuevoDocAntecedentes = new Documento({
            titulo: `Antecedentes Adicionales - ${rut}`,
            pdfArchivo: archivoAntecedentesObj.buffer,
            pdfNombre: archivoAntecedentesObj.originalname,
            pdfContentType: archivoAntecedentesObj.mimetype
        });
        const docAntecedentesGuardado = await nuevoDocAntecedentes.save();
        idAntecedentes = docAntecedentesGuardado._id;
    }

    const datosActualizadosCliente = {
        rol: 'CLIENTE', 
        rut: rut.toUpperCase().trim(),
        telefono: telefono.trim(), 
        edad: Number(edad),
        profesion: profesion.trim(),
        residencia: residencia.trim(),
        antecedentes: idAntecedentes, 
        lugar_act: {
            direccion: lugar_direccion.trim(),
            region: lugar_region.trim(),
            comuna: lugar_comuna.trim(),
            propietario: docPropietarioGuardado._id,
            apta_Act: lugar_apta_Act
        }
    };

    const usuarioActualizado = await User.findByIdAndUpdate(req.user._id, { $set: datosActualizadosCliente }, { returnDocument: 'after', overwriteDiscriminatorKey: true });
    
    req.login(usuarioActualizado, (err) => {
      if (err) return res.status(500).json({ success: false, mensaje: 'Error al refrescar sesión.' });
      return res.status(200).json({ success: true, usuario: usuarioActualizado });
    });

  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, mensaje: 'El RUT ingresado ya se encuentra registrado.' });
    return res.status(500).json({ success: false, mensaje: `Error interno: ${error.message}` });
  }
});

router.get('/colab/cliente/:id', async (req, res) => {
    try {
        const cliente = await Cliente.findById(req.params.id);
        res.status(200).json({ success: true, cliente });
    } catch (error) { res.status(500).json({ success: false }); }
});

router.post('/colab/actualizar-progreso', async (req, res) => {
    try {
        await Cliente.findByIdAndUpdate(req.body.clienteId, { pasos_completos: req.body.nuevosPasos, tramite_completo: req.body.nuevosPasos >= 4 });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// =========================================================================
// REGISTRO DE COLABORADOR (RESTABLECIDO AL ORIGINAL)
// =========================================================================
router.post('/registrar-colaborador', upload.single('file_antecedentes'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, mensaje: "El archivo de antecedentes es obligatorio." });

        const nuevoDocumento = new Documento({
            titulo: `Antecedentes Colaborador - ${req.body.rut}`,
            pdfArchivo: req.file.buffer,
            pdfNombre: req.file.originalname,
            pdfContentType: req.file.mimetype
        });
        const docGuardado = await nuevoDocumento.save();

        const comunasRaw = JSON.parse(req.body.comunas_data || "[]");
        const comunas = comunasRaw.map(c => c.comuna);
        const regiones = [...new Set(comunasRaw.map(c => c.region))];

        const nuevoColab = new Colab({
            nombre: req.body.nombre,
            correo: req.body.correo,
            password: req.body.password, 
            rut: req.body.rut,
            telefono: req.body.telefono,
            rol: 'COLAB',
            estado: 'PENDIENTE', // <--- Restaurado para el panel de administración
            rango_act_comuna: comunas,
            rango_act_region: regiones,
            antecedentes: docGuardado._id 
        });

        await nuevoColab.save();
        res.status(200).json({ success: true, mensaje: "Registro exitoso" });

    } catch (error) {
        res.status(500).json({ success: false, mensaje: error.message });
    }
});

router.post('/colab/tomar-cliente', async (req, res) => {
    try {
        await Cliente.findByIdAndUpdate(req.body.clienteId, { colab_assigned: req.user._id, colab_activo: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

router.get('/usuario/:id', async (req, res) => {
    try {
        const usuario = await User.findById(req.params.id).select('nombre correo');
        res.json({ success: true, usuario });
    } catch (e) { res.status(500).json({ success: false }); }
});

export default router;