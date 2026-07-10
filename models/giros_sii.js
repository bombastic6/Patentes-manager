import mongoose from "mongoose";

const giros_siiSchema = new mongoose.Schema({
  codigo: {
    type: Number,
    required: [true, "El código del giro del SII es obligatorio"],
    unique: true, // Evita códigos duplicados en tu base de datos
    trim: true
  },
  nombre: {
    type: String,
    required: [true, "El nombre o descripción de la actividad es obligatorio"],
    trim: true
  },
  categoria: {
    type: Number,
    required: [true, "La categoría tributaria es obligatoria (1 o 2)"],
    enum: [1, 2], // Valida que solo se ingresen giros de 1era o 2da categoría
    default: 1
  },
  afecto_iva: {
    type: Boolean,
    required: true,
    default: true
  },
  // Banderas de negocio para tu frontend/diagnóstico
  requiere_seremi: {
    type: Boolean,
    required: true,
    default: false // Por defecto false, cambia a true en alimentos, salud, etc.
  },
  tipo_patente_sugerida: {
    type: String,
    required: true,
    enum: ['Comercial', 'Alcoholes', 'Industrial', 'Profesional', 'Microempresa Familiar'],
    default: 'Comercial'
  }
}, {
  timestamps: true // Crea automáticamente 'createdAt' y 'updatedAt'
});

// Tip para optimizar las búsquedas del autocompletar:
// Creamos un índice de texto en el nombre para poder buscar con expresiones regulares de forma rápida
giros_siiSchema.index({ nombre: 'text' });

const Giros_sii = mongoose.models.Giros_sii || mongoose.model('Giros_sii', giros_siiSchema);

export default Giros_sii;