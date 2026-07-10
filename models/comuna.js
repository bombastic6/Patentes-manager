import mongoose from 'mongoose';

const ComunaSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  region: {
    type: String,
    required: true,
    enum: ['Metropolitana', 'Valparaíso']
  },
  compatible_pyme_agil: {
    type: Boolean,
    default: false
  },
  tipo_tramite_patente: {
    type: String,
    required: true,
    enum: ['online', 'semipresencial', 'presencial'],
    default: 'presencial'
  },
  link_dom: {
    type: String,
    default: null
  },
  link_rentas_patentes: {
    type: String,
    default: null
  },
  oficina_virtual_permitida: {
    type: Boolean,
    default: true
  },
  codigo_comuna_sii: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

const Comuna = mongoose.model('Comuna', ComunaSchema);
export default Comuna;