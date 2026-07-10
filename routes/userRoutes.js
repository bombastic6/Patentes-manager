import express from 'express';
import passport from 'passport';
import multer from 'multer';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { User, Invitado, Colab, Admin, Cliente } from '../models/User.js';
import Documento from '../models/Documento.js'; 

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
    let user = await User.findOne({ correo: profile.emails[0].value });

    if (!user) {
      user = new Invitado({
        googleId: profile.id,
        nombre: profile.displayName,
        correo: profile.emails[0].value,
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
    clientID: "203058244125-srko588krj35b8fv1sbo3maudbv2b7vv.apps.googleusercontent.com",
    clientSecret: "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",
    callbackURL: "http://localhost:3000/api/users/auth/google/callback"
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

    if (user.rol === 'INVITADO') {
      const comuna = user.comuna_tramite;

      if (!comuna || comuna.trim() === "" || comuna === "No especificada") {
        console.log(`-> [GOOGLE LOGIN] Usuario ${user.correo} sin comuna válida. Redirigiendo a formulario.html`);
        return res.redirect('http://localhost:3000/formulario.html'); 
      } else {
        console.log(`-> [GOOGLE LOGIN] Usuario ${user.correo} con comuna "${comuna}". Redirigiendo a dashboard.html`);
        return res.redirect('http://localhost:3000/dashboard.html'); 
      }
    }

    if (user.rol === 'CLIENTE') {
      return res.redirect('http://localhost:3000/panel_cliente.html');
    } else if (user.rol === 'ADMIN') {
      return res.redirect('http://localhost:3000/admin_panel.html');
    }

    res.redirect('http://localhost:3000/dashboard.html'); 
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
      console.log("⚠️ Sesión de Passport no encontrada (RAM vacía). Usando usuario de respaldo desde MongoDB Atlas.");
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
      console.error("❌ Error al cerrar sesión en Passport:", err);
      return res.status(500).json({ success: false, mensaje: 'Error al cerrar sesión.' });
    }
    
    req.session.destroy(() => {
      res.clearCookie('connect.sid'); 
      console.log("🔒 Sesión destruida con éxito. Modo logout activo para desarrollo.");
      res.status(200).json({ success: true, mensaje: 'Sesión cerrada correctamente.' });
    });
  });
});

// 1. RUTA ACTUALIZADA: Obtener todos los colaboradores con sus clientes poblados
router.get('/admin/colaboradores-todos', async (req, res) => {
    try {
        // Al hacer el .find(), MongoDB traerá los campos region y comuna si los agregaste al modelo
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

        // Verificamos qué tiene el usuario en la sesión
        console.log("Comunas del colaborador:", req.user.rango_act_comuna);

        // Buscamos clientes cuyas comunas estén en el array del colaborador
        // Aseguramos que NO tengan colaborador asignado (usamos $ne: true o que no exista)
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


// REEMPLAZANDO la ruta antigua de documentos en userRoutes.js
router.get('/admin/documento/:id', async (req, res) => {
    try {
        const doc = await Documento.findById(req.params.id);
        
        if (!doc || !doc.pdfArchivo) {
            return res.status(404).json({ success: false, mensaje: "Documento no encontrado o vacío" });
        }

        // Conversión segura a buffer
        const buffer = Buffer.isBuffer(doc.pdfArchivo) 
            ? doc.pdfArchivo 
            : Buffer.from(doc.pdfArchivo.buffer || doc.pdfArchivo);

        // Cabeceras estrictas para forzar visualización
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="antecedentes.pdf"');
        res.setHeader('Content-Length', buffer.length);
        
        return res.send(buffer);
        
    } catch (error) {
        console.error("Error al obtener PDF:", error);
        res.status(500).json({ success: false, mensaje: "Error interno al procesar el archivo" });
    }
});


// 2. NUEVA RUTA: Obtener todos los clientes (para el apartado de administración)
router.get('/admin/clientes-todos', async (req, res) => {
    try {
        // Filtramos solo los usuarios que sean tipo Cliente
        const clientes = await Cliente.find({}); 
        res.status(200).json({ success: true, clientes });
    } catch (error) {
        res.status(500).json({ success: false, mensaje: 'Error al obtener clientes' });
    }
});

// Nueva ruta para cambiar estado
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
    console.error("Error en /registrar_local:", error);
    res.status(500).json({ success: false, mensaje: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { correo, password } = req.body;

    if (!correo || !password) {
      return res.status(400).json({ success: false, mensaje: 'El correo y la contraseña son obligatorios.' });
    }

    // 1. Primero buscamos al usuario
    const emailFormateado = correo.toLowerCase().trim();
    const usuario = await User.findOne({ correo: emailFormateado });
    
    if (!usuario) {
      return res.status(401).json({ success: false, mensaje: 'El correo electrónico no coincide con ningún registro.' });
    }

    // 2. AHORA SÍ: Validamos el rol (después de saber quién es)
    if (usuario.rol !== 'ADMIN' && usuario.rol !== 'COLAB') {
      return res.status(403).json({ success: false, mensaje: 'No tiene permisos para acceder a este panel.' });
    }

    // 3. Validar contraseña (debes usar bcrypt)
    // const esValida = await bcrypt.compare(password, usuario.password);
    // Si no usas bcrypt (no recomendado), mantén tu comparación:
    if (usuario.password !== password) {
      return res.status(401).json({ success: false, mensaje: 'Contraseña incorrecta.' });
    }

    // 4. Iniciar sesión
    req.login(usuario, (err) => {
      if (err) {
        console.error("❌ Error al establecer sesión en /login:", err);
        return res.status(500).json({ success: false, mensaje: 'Error al procesar la sesión.' });
      }

      const urlDestino = usuario.rol === 'ADMIN' ? 'panel_admin.html' : 'panel_colab.html';

      return res.status(200).json({
        success: true,
        redirectUrl: urlDestino,
        usuario: {
          id: usuario._id,
          nombre: usuario.nombre,
          rol: usuario.rol
        }
      });
    });

  } catch (error) {
    console.error("❌ Error en servidor:", error);
    return res.status(500).json({ success: false, mensaje: 'Error interno del servidor.' });
  }
});

router.post('/crear_invitado', async (req, res) => {
  try {
    const { 
      nombre,
      correo,
      region_tramite,
      comuna_tramite,
      tipo_tramite_comuna, 
      constitucion_legal,
      giro_empresa_codigo,
      situacion_sii,
      patente_primaria,
      patente_secundaria 
    } = req.body;

    if (!correo) {
      return res.status(400).json({ success: false, mensaje: 'El campo correo es obligatorio.' });
    }

    const emailFormateado = correo.toLowerCase().trim();

    let regionLimpia = 'No especificada';
    if (region_tramite) {
      regionLimpia = region_tramite
        .replace(/Región de\s+/i, '')  
        .replace(/Región\s+/i, '')    
        .trim();
    }

    let usuario = await Invitado.findOne({ correo: emailFormateado });

    const datosDiagnostico = {
      nombre: nombre || 'Usuario Invitado',
      correo: emailFormateado,
      rol: 'INVITADO',
      estado: 'APROBADO',
      region_tramite: regionLimpia,
      comuna_tramite: comuna_tramite || 'No especificada', 
      tipo_tramite_comuna: Number(tipo_tramite_comuna) || 0, 
      constitucion_legal: Number(constitucion_legal) || 4,
      giro_empresa_codigo: Number(giro_empresa_codigo) || 0,
      situacion_sii: Number(situacion_sii) || 1,
      patente_primaria: patente_primaria || 'PENDIENTE',
      patente_secundaria: patente_secundaria || ''
    };

    if (!usuario) {
      usuario = new Invitado(datosDiagnostico);
    } else {
      usuario.region_tramite = datosDiagnostico.region_tramite;
      usuario.comuna_tramite = datosDiagnostico.comuna_tramite; 
      usuario.tipo_tramite_comuna = datosDiagnostico.tipo_tramite_comuna; 
      usuario.constitucion_legal = datosDiagnostico.constitucion_legal;
      usuario.giro_empresa_codigo = datosDiagnostico.giro_empresa_codigo;
      usuario.situacion_sii = datosDiagnostico.situacion_sii;
      usuario.patente_primaria = datosDiagnostico.patente_primaria;
      usuario.patente_secundaria = datosDiagnostico.patente_secundaria;
      usuario.set('pasos_completos', undefined); 
      if (nombre) usuario.nombre = nombre;
    }

    const usuarioGuardado = await usuario.save();
    logoutTemporalDesarrollo = false;

    res.status(200).json({ 
      success: true, 
      mensaje: '¡Diagnóstico actualizado con éxito!', 
      usuario: usuarioGuardado 
    });

  } catch (error) {
    console.error("❌ Error en /crear_invitado:", error);
    res.status(400).json({ success: false, mensaje: error.message });
  }
});


//eliminar en un futuro o comentar, es solo para el proceso de pruebas
router.post('/crear-admin', async (req, res) => {
    try {
        const { nombre, correo, password } = req.body;

        const nuevoAdmin = new Admin({
            nombre,
            correo,
            password,
            rol: 'ADMIN',
            estado: 'APROBADO' // El admin debería estar aprobado desde el inicio
        });

        await nuevoAdmin.save();
        res.status(201).json({ success: true, mensaje: 'Administrador creado con éxito' });
    } catch (error) {
        res.status(400).json({ success: false, mensaje: error.message });
    }
});

router.post('/login-usuario', async (req, res) => {
  try {
    const { correo, password } = req.body;
    if (!correo || !password) {
      return res.status(400).json({ success: false, mensaje: 'Credenciales incompletas.' });
    }

    const usuario = await User.findOne({ correo: correo.toLowerCase().trim() });
    
    if (!usuario) {
      return res.status(401).json({ success: false, mensaje: 'Usuario no encontrado.' });
    }

    // BLOQUEO: Si intentan entrar aquí siendo ADMIN o COLAB, los rechazamos
    if (usuario.rol === 'ADMIN' || usuario.rol === 'COLAB') {
      return res.status(403).json({ success: false, mensaje: 'Acceso no permitido en este panel.' });
    }

    // Validación de contraseña
    if (usuario.password !== password) {
      return res.status(401).json({ success: false, mensaje: 'Contraseña incorrecta.' });
    }

    req.login(usuario, (err) => {
      if (err) return res.status(500).json({ success: false, mensaje: 'Error de sesión.' });

      return res.status(200).json({
        success: true,
        usuario: {
          id: usuario._id,
          nombre: usuario.nombre,
          rol: usuario.rol,
          comuna_tramite: usuario.comuna_tramite || null
        }
      });
    });

  } catch (error) {
    res.status(500).json({ success: false, mensaje: 'Error interno del servidor.' });
  }
});

// =========================================================================
// 4. ACTUALIZAR O TRANSMUTAR ROL A CLIENTE (DOCUMENTOS BINARIOS)
// =========================================================================
router.put('/actualizar-a-cliente', upload.fields([
  { name: 'file_propietario', maxCount: 1 },
  { name: 'file_antecedentes', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, mensaje: 'No hay una sesión activa. Por favor inicia sesión.' });
    }

    const usuarioId = req.user._id;

    const {
      rut,
      telefono,
      edad,
      profesion,
      residencia,
      lugar_direccion,
      lugar_region,
      lugar_comuna,
      lugar_apta_Act
    } = req.body;

    if (!rut || !telefono || !edad || !profesion || !residencia || !lugar_direccion || !lugar_region || !lugar_comuna || !lugar_apta_Act) {
      return res.status(400).json({ success: false, mensaje: 'Faltan campos obligatorios para activar el perfil comercial.' });
    }

    if (!req.files || !req.files['file_propietario']) {
      return res.status(400).json({ success: false, mensaje: 'El archivo de Acreditación de Propiedad / Arriendo (PDF) es obligatorio.' });
    }

    const archivoPropietarioObj = req.files['file_propietario'][0];
    
    const nuevoDocPropietario = new Documento({
      titulo: `Acreditación Propiedad - ${rut}`,
      pdfArchivo: archivoPropietarioObj.buffer, 
      pdfNombre: archivoPropietarioObj.originalname,
      pdfContentType: archivoPropietarioObj.mimetype
    });
    const docPropietarioGuardado = await nuevoDocPropietario.save();

    // 1. Inicializa como null o undefined, no como un string de texto
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
        
        // Guardamos SOLO el ID
        idAntecedentes = docAntecedentesGuardado._id;
    }

    const datosActualizadosCliente = {
        rol: 'CLIENTE', 
        rut: rut.toUpperCase().trim(),
        telefono: telefono.trim(), 
        edad: Number(edad),
        profesion: profesion.trim(),
        residencia: residencia.trim(),
        // Guardamos el ID (o null si no hay archivo)
        antecedentes: idAntecedentes, 
        lugar_act: {
            direccion: lugar_direccion.trim(),
            region: lugar_region.trim(),
            comuna: lugar_comuna.trim(),
            propietario: docPropietarioGuardado._id, // Ya lo corregimos antes
            apta_Act: lugar_apta_Act
    }
};

    const usuarioActualizado = await User.findByIdAndUpdate(
      usuarioId,
      { $set: datosActualizadosCliente },
      { 
        returnDocument: 'after',          
        runValidators: true,              
        overwriteDiscriminatorKey: true   
      }
    );

    if (!usuarioActualizado) {
      return res.status(404).json({ success: false, mensaje: 'Usuario no encontrado en la base de datos.' });
    }

    console.log(`🚀 Usuario ${usuarioActualizado.correo} transmutado exitosamente a CLIENTE.`);

    req.login(usuarioActualizado, (err) => {
      if (err) {
        console.error("❌ Error al refrescar sesión en Passport:", err);
        return res.status(500).json({ success: false, mensaje: 'Datos guardados, pero falló la actualización de sesión.' });
      }
      
      return res.status(200).json({
        success: true,
        mensaje: '¡Perfil comercial activado con éxito y documentos guardados en la BD!',
        usuario: usuarioActualizado
      });
    });

  } catch (error) {
    console.error("❌ Error en PUT /actualizar-a-cliente:", error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, mensaje: 'El RUT ingresado ya se encuentra registrado por otro cliente.' });
    }
    return res.status(500).json({ success: false, mensaje: `Error interno: ${error.message}` });
  }
});




// 1. Obtener detalles de un cliente específico para gestión
router.get('/colab/cliente/:id', async (req, res) => {
    try {
        const cliente = await Cliente.findById(req.params.id);
        if (!cliente) return res.status(404).json({ success: false, mensaje: 'Cliente no encontrado' });
        res.status(200).json({ success: true, cliente });
    } catch (error) {
        res.status(500).json({ success: false, mensaje: 'Error al obtener cliente' });
    }
});

// 2. Actualizar el progreso del cliente (Pasos y completar trámite)
router.post('/colab/actualizar-progreso', async (req, res) => {
    try {
        const { clienteId, nuevosPasos } = req.body; // nuevosPasos: 1, 2, 3, 4
        
        // Si llega a 4, marcamos el tramite como completo
        const esCompleto = nuevosPasos >= 4;
        
        await Cliente.findByIdAndUpdate(clienteId, {
            pasos_completos: nuevosPasos,
            tramite_completo: esCompleto
        });

        res.json({ success: true, mensaje: 'Progreso actualizado' });
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al actualizar progreso' });
    }
});

// Asegúrate de importar multer si manejas archivos


router.post('/registrar-colaborador', upload.single('file_antecedentes'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, mensaje: "El archivo de antecedentes es obligatorio." });
        }

        // 1. Guardar el archivo en la colección Documento
        const nuevoDocumento = new Documento({
            titulo: `Antecedentes Colaborador - ${req.body.rut}`,
            pdfArchivo: req.file.buffer, // El buffer que viene de memoryStorage
            pdfNombre: req.file.originalname,
            pdfContentType: req.file.mimetype
        });
        const docGuardado = await nuevoDocumento.save();

        // 2. Procesar comunas
        const comunasRaw = JSON.parse(req.body.comunas_data || "[]");
        const comunas = comunasRaw.map(c => c.comuna);
        const regiones = [...new Set(comunasRaw.map(c => c.region))];

        // 3. Crear el colaborador asignando el ID del documento recién creado
        const nuevoColab = new Colab({
            nombre: req.body.nombre,
            correo: req.body.correo,
            password: req.body.password, // Recuerda encriptar esto en producción
            rut: req.body.rut,
            telefono: req.body.telefono,
            rol: 'COLAB',
            rango_act_comuna: comunas,
            rango_act_region: regiones,
            antecedentes: docGuardado._id // <--- AQUÍ ESTÁ LA SOLUCIÓN
        });

        await nuevoColab.save();
        
        res.status(200).json({ success: true, mensaje: "Registro exitoso" });

    } catch (error) {
        console.error("ERROR AL GUARDAR COLAB:", error);
        res.status(500).json({ success: false, mensaje: error.message });
    }
});


// 3. Ruta para que el colaborador tome un cliente (Asignación)
router.post('/colab/tomar-cliente', async (req, res) => {
    try {
        const { clienteId } = req.body;
        // Asignamos el ID del colaborador actual al cliente
        await Cliente.findByIdAndUpdate(clienteId, {
            colab_assigned: req.user._id,
            colab_activo: true
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

router.get('/usuario/:id', async (req, res) => {
    try {
        const usuario = await User.findById(req.params.id).select('nombre correo');
        if (!usuario) return res.status(404).json({ success: false });
        res.json({ success: true, usuario });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

export default router;