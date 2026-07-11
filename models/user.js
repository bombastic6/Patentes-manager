import mongoose from 'mongoose';

// =========================================================================
// 1. SUB-ESQUEMA EMBEBIDO (Solo se usará dentro de Cliente)
// =========================================================================
const lugarActividadSchema = new mongoose.Schema({
  direccion: { type: String, required: true, trim: true },
  region: { type: String, required: true },
  comuna: { type: String, required: true, trim: true },
  // Se cambió de String a ObjectId (Referencia a un documento/archivo)
  propietario: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Documento', 
    required: true 
  },
  apta_Act: { type: String, required: true }
}, { _id: false });


// =========================================================================
// 2. ESQUEMA Y MODELO BASE (Mínimo Común Multiplo)
// =========================================================================
const userSchema = new mongoose.Schema({
  googleId: { 
    type: String, 
    unique: true, 
    sparse: true 
  },
  nombre: { 
    type: String, 
    required: [true, 'El nombre es obligatorio'], 
    trim: true 
  },
  correo: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true, 
    lowercase: true 
  },
  password: { 
    type: String, 
    required: false 
  },
  estado: { 
    type: String, 
    required: true, 
    enum: ['PENDIENTE', 'APROBADO', 'RECHAZADO', 'BANEADO'], 
    default: 'APROBADO' 
  },
  rol: { 
    type: String, 
    required: true, 
    enum: ['ADMIN', 'CLIENTE', 'COLAB', 'VERIFICADOR', 'INVITADO'], 
    default: 'INVITADO' 
  },
  fechaRegistro: { type: Date, default: Date.now }
}, {
  timestamps: true,
  discriminatorKey: 'rol'
});

const User = mongoose.model('User', userSchema);


// =========================================================================
// 3. DISCRIMINADORES
// =========================================================================

// 🟢 NIVEL 1: INVITADO (Actualizado a 5 Pasos)
// 🟢 NIVEL 1: INVITADO (Actualizado para permitir registro inicial)
const Invitado = User.discriminator('INVITADO', new mongoose.Schema({ 
  region_tramite: { 
    type: String, 
    required: false, // Cambiado de true a false
    default: 'No especificada' 
  },
  comuna_tramite: { 
    type: String, 
    required: false, // Cambiado de true a false
    default: 'No especificada' 
  },
  tipo_tramite_comuna: {
    type: Number,
    required: false, // Cambiado de true a false
    default: 0
  },
  constitucion_legal: {
    type: Number,
    enum: [1, 2, 3, 4],
    required: false, // Cambiado de true a false
    default: 4
  },
  giro_empresa_codigo: {
    type: Number,
    required: false // <--- ¡AQUÍ ESTABA EL ERROR PRINCIPAL!
  },
  situacion_sii: {
    type: Number,
    enum: [1, 2, 3],
    required: false, // Cambiado de true a false
    default: 1
  },
  patente_primaria: {
    type: String,
    required: false, // Cambiado de true a false
    default: 'PENDIENTE'
  },
  patente_secundaria: {
    type: String,
    default: '',
    required: false
  }
}));

// 🔵 NIVEL 2: CLIENTE
const Cliente = User.discriminator('CLIENTE', new mongoose.Schema({ 
  rut: { 
    type: String, 
    required: true, 
    unique: true, 
    sparse: true, 
    trim: true, 
    uppercase: true 
  },
  telefono: { type: String, required: true, trim: true },
  edad: { type: Number, required: true, min: 0 },
  residencia: { type: String, required: true },
  profesion: { type: String, required: true, trim: true },
  
  // Se cambió de String a ObjectId (Referencia)
  antecedentes: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Documento',
    default: null 
  },
  
  lugar_act: { type: lugarActividadSchema, required: true },
  
  colab_activo: { 
    type: Boolean, 
    default: false 
  },
  colab_assigned: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null 
  },
  firma_apoderado: { 
    type: Boolean, 
    default: false 
  },
  documento_apoderado: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Documento', 
    default: null 
  },
  tramite_completo: { 
    type: Boolean, 
    default: false 
  }, 
  pasos_completos: { 
    type: Number, 
    default: 0,
  }
}));

// 🟠 PERSONAL INTERNO Y COLABORADORES
const Colab = User.discriminator('COLAB', new mongoose.Schema({ 
  rut: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true, 
    uppercase: true 
  },
  telefono: { 
    type: String, 
    required: true, 
    trim: true 
  },
  
  // COBERTURA TERRITORIAL MULTI-REGIÓN (ACTUALIZADO)
  rango_act_comuna: {
    type: [String],
    required: [true, 'Debe especificar al menos una comuna de actividad'],
    lowercase: true,
    trim: true
  },
  rango_act_region: {
    type: [String],
    required: [true, 'Debe especificar las regiones correspondientes'],
    lowercase: true,
    trim: true
  },
  
  // Se cambió de String a ObjectId (Referencia)
  antecedentes: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Documento',
    required: true 
  },

  clientes_activos: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  clientes_completados: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }]
}));

const Admin = User.discriminator('ADMIN', new mongoose.Schema({ 
  descripcion: { type: String, default: 'Administrador de plataforma' }
})); 


// =========================================================================
// 4. EXPORTACIÓN DE MODELOS
// =========================================================================
export { User, Cliente, Admin, Colab, Invitado };