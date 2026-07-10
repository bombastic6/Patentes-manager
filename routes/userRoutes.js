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
    
    if (!email) {
        return done(new Error("No se pudo obtener el correo electrónico del perfil de Google"), null);
    }

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
    console.error("Error detallado en googleVerify:", error);
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
    
    // REDIRECCIÓN DIRECTA AL BACKEND DONDE ESTÁN LOS HTML
    const base = "https://tupatente-backend.onrender.com";

    if (user.rol === 'INVITADO') {
      const comuna = user.comuna_tramite;

      if (!comuna || comuna.trim() === "" || comuna === "No especificada") {
        return res.redirect(`${base}/formulario.html`); 
      } else {
        return res.redirect(`${base}/dashboard.html`); 
      }
    }

    if (user.rol === 'CLIENTE') {
      return res.redirect(`${base}/panel_cliente.html`);
    } else if (user.rol === 'ADMIN') {
      return res.redirect(`${base}/admin_panel.html`);
    }

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
    
    if (usuarioRespaldo) {
      return res.status(200).json({ success: true, usuario: usuarioRespaldo });
    }
  } catch (error) {
    console.error("Error al buscar usuario de respaldo en la BD:", error);
  }

  res.status(401).json({ success: false, mensaje: 'Sin sesión activa.' }); 
});

router.get('/auth/logout', (req, res) => {
  logoutTemporalDesarrollo = true;

  req.logout((err) => {
    if (err) {
      return res.status(500).json({ success: false, mensaje: 'Error al cerrar sesión.' });
    }
    
    req.session.destroy(() => {
      res.clearCookie('connect.sid'); 
      res.status(200).json({ success: true, mensaje: 'Sesión cerrada correctamente.' });
    });
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
            $or: [
                { colab_activo: { $ne: true } },
                { colab_activo: { $exists: false } }
            ]
        });

        const misClientes = await Cliente.find({
            colab_assigned: req.user._id
        });

        res.status(200).json({ disponibles, misClientes });
    } catch (error) {
        console.error("Error en /clientes-cobertura:", error);
        res.status(500).json({ success: false, mensaje: 'Error al obtener clientes' });
    }
});

router.get('/admin/documento/:id', async (req, res) => {
    try {
        const doc = await Documento.findById(req.params.id);
        
        if (!doc || !doc.pdfArchivo) {
            return res.status(404).json({ success: false, mensaje: "Documento no encontrado o vacío" });
        }

        const buffer = Buffer.isBuffer(doc.pdfArchivo) 
            ? doc.pdfArchivo 
            : Buffer.from(doc.pdfArchivo.buffer || doc.pdfArchivo);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="antecedentes.pdf"');
        res.setHeader('Content-Length', buffer.length);
        
        return res.send(buffer);
        
    } catch (error) {
        console.error("Error al obtener PDF:", error);
        res.status(500).json({ success: false, mensaje: "Error interno al procesar el archivo" });
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

router.post('/registrar_local', async (req, res) => {
  try {
    const { nombre, correo, password } = req.body;
    if (!nombre || !correo || !password) {
      return res.status(400).json({ success: false, mensaje: 'Todos los campos son obligatorios.' });
    }
    const emailFormateado = correo.toLowerCase().trim();
    const usuarioExistente = await Invitado.findOne({ correo: emailFormateado });
    if (usuarioExistente) {
      return res.status(400).json({ success: false, mensaje: 'Este correo electrónico ya se encuentra registrado.' });
    }
    const nuevoUsuario = new Invitado({
      nombre: nombre.trim(),
      correo: emailFormateado,
      password: password, 
      rol: 'INVITADO',
      estado: 'APROBADO'
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
    if (!correo || !password) return res.status(400).json({ success: false });
    const usuario = await User.findOne({ correo: correo.toLowerCase().trim() });
    if (!usuario || (usuario.rol !== 'ADMIN' && usuario.rol !== 'COLAB') || usuario.password !== password) {
      return res.status(401).json({ success: false, mensaje: 'Credenciales inválidas o sin permisos.' });
    }
    req.login(usuario, (err) => {
      if (err) return res.status(500).json({ success: false });
      return res.status(200).json({
        success: true,
        redirectUrl: usuario.rol === 'ADMIN' ? 'panel_admin.html' : 'panel_colab.html',
        usuario: { id: usuario._id, nombre: usuario.nombre, rol: usuario.rol }
      });
    });
  } catch (error) { res.status(500).json({ success: false }); }
});

router.post('/crear_invitado', async (req, res) => {
  try {
    const { correo, ...resto } = req.body;
    let usuario = await Invitado.findOne({ correo: correo.toLowerCase().trim() });
    if (!usuario) usuario = new Invitado({ correo, ...resto });
    else Object.assign(usuario, resto);
    await usuario.save();
    res.status(200).json({ success: true, usuario });
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
    const usuario = await User.findOne({ correo: correo.toLowerCase().trim() });
    if (!usuario || usuario.rol === 'ADMIN' || usuario.rol === 'COLAB' || usuario.password !== password) {
      return res.status(401).json({ success: false });
    }
    req.login(usuario, (err) => {
      if (err) return res.status(500).json({ success: false });
      return res.status(200).json({ success: true, usuario });
    });
  } catch (error) { res.status(500).json({ success: false }); }
});

router.put('/actualizar-a-cliente', upload.fields([{ name: 'file_propietario', maxCount: 1 }, { name: 'file_antecedentes', maxCount: 1 }]), async (req, res) => {
  try {
    const docPropietario = new Documento({
      titulo: `Acreditación - ${req.body.rut}`,
      pdfArchivo: req.files['file_propietario'][0].buffer,
      pdfNombre: req.files['file_propietario'][0].originalname
    });
    const docGuardado = await docPropietario.save();
    const datosCliente = { ...req.body, rol: 'CLIENTE', lugar_act: { ...req.body.lugar_act, propietario: docGuardado._id } };
    const usuarioActualizado = await User.findByIdAndUpdate(req.user._id, { $set: datosCliente }, { returnDocument: 'after', overwriteDiscriminatorKey: true });
    res.status(200).json({ success: true, usuario: usuarioActualizado });
  } catch (error) { res.status(500).json({ success: false, mensaje: error.message }); }
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

router.post('/registrar-colaborador', upload.single('file_antecedentes'), async (req, res) => {
    try {
        const nuevoDocumento = new Documento({
            titulo: `Antecedentes - ${req.body.rut}`,
            pdfArchivo: req.file.buffer,
            pdfNombre: req.file.originalname
        });
        const docGuardado = await nuevoDocumento.save();
        const nuevoColab = new Colab({ ...req.body, rol: 'COLAB', antecedentes: docGuardado._id });
        await nuevoColab.save();
        res.status(200).json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
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