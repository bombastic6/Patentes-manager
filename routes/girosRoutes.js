import express from 'express';
import Giros_sii from '../models/giros_sii.js'; 

const router = express.Router();

// 1. GET: Buscar giros para el autocompletar del frontend
router.get('/giros', async (req, res) => {
  try {
    const { search } = req.query;

    // SI EL FRONTEND PIDE TODO EL CATÁLOGO: Devolvemos todo sin límite
    if (search === 'ALL_DATA') {
      const todos = await Giros_sii.find({})
        .select('codigo nombre requiere_seremi tipo_patente_sugerida');
      return res.json(todos);
    }

    // --- Tu lógica original por si buscas de forma tradicional (se mantiene por seguridad) ---
    if (!search || search.trim().length < 3) {
      return res.json([]);
    }

    const query = {
      $or: [
        { nombre: { $regex: search, $options: 'i' } },
        { codigo: isNaN(search) ? null : Number(search) }
      ]
    };

    const resultados = await Giros_sii.find(query)
      .select('codigo nombre requiere_seremi tipo_patente_sugerida')
      .limit(10);

    res.json(resultados);
  } catch (error) {
    console.error('Error al buscar giros del SII:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
});

// 2. POST: Poblar o insertar giros de manera masiva desde Thunder Client
router.post('/giros', async (req, res) => {
  try {
    const datosRecibidos = req.body;

    // Validamos que nos estén enviando un array de datos
    if (!Array.isArray(datosRecibidos) || datosRecibidos.length === 0) {
      return res.status(400).json({ 
        mensaje: 'El cuerpo de la petición debe ser un array con al menos un giro comercial.' 
      });
    }

    // Usamos insertMany para guardar toda la lista en una sola operación de BD
    const girosInsertados = await Giros_sii.insertMany(datosRecibidos);

    res.status(201).json({
      mensaje: `¡Éxito! Se han guardado ${girosInsertados.length} giros comerciales en la base de datos.`,
      datos: girosInsertados
    });
  } catch (error) {
    console.error('Error al insertar los giros masivos:', error);
    
    // Captura por si intentas mandar un código duplicado (gracias al unique: true del schema)
    if (error.code === 11000) {
      return res.status(400).json({
        mensaje: 'Error de duplicidad: Uno o más códigos del SII ya existen en la base de datos.'
      });
    }

    res.status(500).json({ 
      mensaje: 'Error interno al intentar guardar el listado masivo.' 
    });
  }
});

export default router;