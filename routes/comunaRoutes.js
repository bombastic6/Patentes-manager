import express from 'express';
import Comuna from '../models/Comuna.js';

const router = express.Router();

// =========================================================================
// NUEVA RUTA: OBTENER REGIONES Y SUS COMUNAS AGRUPADAS PARA LOS SELECTORES
// GET /api/comunas/regiones-y-comunas
// =========================================================================
router.get('/regiones-y-comunas', async (req, res) => {
  try {
    const comunasBD = await Comuna.find({}, 'nombre region');
    
    // Estructuramos el objeto dinámicamente tal como lo espera el frontend
    const mapaTerritorial = {};

    comunasBD.forEach(c => {
      if (!mapaTerritorial[c.region]) {
        mapaTerritorial[c.region] = [];
      }
      // Guardamos el nombre respetando los acentos originales de la BD (ej: "Quilpué")
      if (!mapaTerritorial[c.region].includes(c.nombre)) {
        mapaTerritorial[c.region].push(c.nombre);
      }
    });

    res.json({
      success: true,
      data: mapaTerritorial
    });
  } catch (error) {
    console.error('Error al estructurar regiones y comunas:', error);
    res.status(500).json({ success: false, mensaje: 'Error al obtener listado territorial.' });
  }
});


router.get('/clientes-cobertura', async (req, res) => {
    try {
        if (!req.user || req.user.rol !== 'COLAB') return res.status(401).json({ success: false });

        const colaborador = req.user;

        // Clientes disponibles en las comunas del colaborador que no tienen asignado a nadie
        const disponibles = await Cliente.find({
            'lugar_act.comuna': { $in: colaborador.rango_act_comuna },
            colab_assigned: null
        });

        // Clientes ya asignados al colaborador
        const misClientes = await Cliente.find({ colab_assigned: colaborador._id });

        res.status(200).json({ success: true, disponibles, misClientes });
    } catch (error) {
        res.status(500).json({ success: false, mensaje: error.message });
    }
});

// 1. OBTENER INFORMACIÓN DE UNA COMUNA POR SU NOMBRE
router.get('/buscar/:nombre', async (req, res) => {
  try {
    const nombreComuna = req.params.nombre;
    const comunaEncontrada = await Comuna.findOne({
      nombre: { $regex: new RegExp(`^${nombreComuna.trim()}$`, 'i') }
    });

    if (!comunaEncontrada) {
      return res.status(404).json({
        success: false,
        mensaje: `No se encontró información de factibilidad para la comuna: ${nombreComuna}`
      });
    }

    res.json({ success: true, comuna: comunaEncontrada });
  } catch (error) {
    console.error('Error al buscar comuna:', error);
    res.status(500).json({ success: false, mensaje: 'Error interno del servidor.' });
  }
});

// 2. OBTENER TODAS LAS COMUNAS
router.get('/', async (req, res) => {
  try {
    const comunas = await Comuna.find({});
    res.json({ success: true, comunas });
  } catch (error) {
    res.status(500).json({ success: false, mensaje: error.message });
  }
});

// 3. ENDPOINT RÁPIDO PARA INSERTAR/ACTUALIZAR UNA COMUNA (Upsert)
router.post('/upsert', async (req, res) => {
  try {
    const { nombre } = req.body;
    const comunaActualizada = await Comuna.findOneAndUpdate(
      { nombre: { $regex: new RegExp(`^${nombre.trim()}$`, 'i') } },
      req.body,
      { new: true, upsert: true }
    );
    res.json({ success: true, comuna: comunaActualizada });
  } catch (error) {
    res.status(400).json({ success: false, mensaje: error.message });
  }
});

export default router;