const sClass = require("../models/classModel");
const CardDetails = require("../models/carddetailsModel");
const Staff = require("../models/staffModel");
const { BadUserRequestError, NotFoundError, UnAuthorizedError } =
  require('../middleware/errors')

const supabase = require('../utils/supabaseClient')

const multer = require("multer"); // multer will be used to handle the form data.
const multerStorage = multer.memoryStorage()


const upload = () =>
  multer({
    storage: multerStorage,
    fileFilter: (req, file, cb) => {
      if (file.mimetype === "image/png") {
        cb(null, true)
      } else {
        cb(new Error("Invalid file type! Only PNG files are accepted. Make sure your signature has a transparent background"))
      }
    },
    limits: { fileSize: 1024 * 1024 } // 1MB
  })


const uploadImg = async (req, res, next) => {
  try {
    const classteacher = await Staff.findOne({ email: req.user.email })
    const teacherId = classteacher._id.toString() // use MongoDB _id as identifier

    // Use Multer to parse the file
    const uploadSingle = upload().single("signatureImage")
    uploadSingle(req, res, async (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).end("File exceeds accepted standard! Not more than 1MB")
      } else if (err) {
        return res.status(400).end(err.message)
      } else if (!req.file) {
        return res.status(400).end("File is required!")
      }

      // 1️⃣ Upload to Supabase
      const fileName = `teacher_${teacherId}.png`
      const { data, error } = await supabase
        .storage
        .from('staffsignatures')
        .upload(fileName, req.file.buffer, { upsert: true, contentType: 'image/png' })

      if (error) {
        console.error('Supabase upload error:', error)
        return res.status(500).end("Failed to upload signature")
      }

      // 2️⃣ Get public URL
      const { data: urlData } = supabase
        .storage
        .from('staffsignatures')
        .getPublicUrl(fileName)
      const publicUrl = urlData.publicUrl

      // 3️⃣ Update MongoDB
      await Staff.updateOne(
        { _id: classteacher._id },
        { $set: { signatureUrl: publicUrl } }
      )

      // 4️⃣ Pass URL to next middleware
      req.signature_url = publicUrl
      req.teacherId = classteacher._id
      next()
    })
  } catch (err) {
    console.error(err)
    return res.status(500).end("Server error")
  }
}

const uploadPrplSignature = async (req, res, next) => {
  const principal = await Staff.findOne({ email: req.user.email })
  const prcpl_programme = principal.teacherProgramme

  const uploadSingle = upload().single("signatureImage");
  uploadSingle(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(404).end("file exceeds accepted standard! Not more than 1MB");
    } else if (err) {
      return res.status(404).end(err.message);
    } else if (!req.file) {
      return res.status(404).end("File is required!");
    }

    // 1️⃣ Upload to Supabase
    const fileName = `principal_${prcpl_programme}.png`
    const { data, error } = await supabase
      .storage
      .from('staffsignatures')
      .upload(fileName, req.file.buffer, { upsert: true, contentType: 'image/png' })

    if (error) {
      console.error('Supabase upload error:', error)
      return res.status(500).end("Failed to upload signature")
    }

    // 2️⃣ Get public URL
    const { data: urlData } = supabase
      .storage
      .from('staffsignatures')
      .getPublicUrl(fileName)
    const publicUrl = urlData.publicUrl

    // 3️⃣ Update MongoDB
    await Staff.updateOne(
      { _id: principal._id },
      { $set: { signatureUrl: publicUrl } }
    )
    // get url of image and pass to the next middleware
    req.signature_url = publicUrl;
    next();
  });
};

const uploadPropSignature = async (req, res, next) => {
  const uploadSingle = upload().single("signatureImage");
  uploadSingle(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(404).end("file exceeds accepted standard! Not more than 1MB");
    } else if (err) {
      return res.status(404).end(err.message);
    } else if (!req.file) {
      return res.status(404).end("File is required!");
    }

    // 1️⃣ Upload to Supabase
    const fileName = `proprietor_signature.png`
    const { data, error } = await supabase
      .storage
      .from('staffsignatures')
      .upload(fileName, req.file.buffer, { upsert: true, contentType: 'image/png' })

    if (error) {
      console.error('Supabase upload error:', error)
      return res.status(500).end("Failed to upload signature")
    }

    // 2️⃣ Get public URL
    const { data: urlData } = supabase
      .storage
      .from('staffsignatures')
      .getPublicUrl(fileName)
    const publicUrl = urlData.publicUrl

    // get url of image and pass to the next middleware
    req.signature_url = publicUrl;
    next();
  });
};

// add details for a class
const addDetails = async (req, res, next) => {
  const { noInClass, termName, sessionName } = req.body;
  const { className, programme } = req.query;

  const classExists = await sClass.findOne({
    className,
    programme
  });
  if (!classExists) {
    throw new NotFoundError("Error: the requested class does not exist");
  }

  //  Check if term + session already exists
  const existingTerm = classExists.termlyDetails.find(
    (term) =>
      term.termName === termName &&
      term.sessionName === sessionName
  );
  if (existingTerm) {
    // ✅ Update existing record
    existingTerm.noInClass = noInClass;
    existingTerm.classTeacherId = req.teacherId;
  } else {
    //  Add new record
    classExists.termlyDetails.push({
      sessionName,
      termName,
      noInClass,
      classTeacherId: req.teacherId
    });
  }
  await classExists.save();

  res.status(200).json({
    status: "Success",
    message: existingTerm
      ? "Details updated successfully"
      : "Details added successfully",
    classExists
  });
};

const addPrincipalSignature = async (req, res, next) => {
  const { programme } = req.query
  const detailsExist = await CardDetails.findOne({ programme })
  if (!detailsExist) {
    const addDetails = await CardDetails.create({ programme, principalSignature: req.signature_url })
    return res.status(201).json({
      status: "Success",
      message: "principal signature added successfully",
      addDetails
    });
  }
  detailsExist.principalSignature = req.signature_url;
  detailsExist.save();

  res.status(200).json({
    status: "Success",
    message: "principal signature updated successfully",
    detailsExist
  });
};

const addProprietorSignature = async (req, res, next) => {
  const { programme } = req.query
  const detailsExist = await CardDetails.find({})
  for (let i = 0; i < detailsExist.length; i++) {
    detailsExist[i].proprietorSignature = req.signature_url;
    detailsExist[i].save();
  }

  res.status(200).json({
    status: "Success",
    message: "proprietor signature added successfully",
    detailsExist
  });
};

const getClassSubjects = async (req, res, next) => {
  const { className, programme } = req.query;
  const classExists = await sClass.findOne({
    $and:
      [
        { className },
        { programme }
      ]
  })
  if (!classExists) throw new NotFoundError("Error: this class is not registered");
  if (classExists.subjects.length == 0) throw new NotFoundError("Error: this class has no registered subjects");
  res.status(200).json({ status: "success", message: "successful", classExists });
}

const addClassSubject = async (req, res, next) => {
  const { className, programme } = req.query;
  const { subject } = req.body;
  const classExists = await sClass.findOne({
    $and:
      [
        { className },
        { programme }
      ]
  })

  if (!classExists) throw new NotFoundError("Error: the requested class does not exist");
  for (let count = 0; count < classExists.subjects.length; count++) {
    if (classExists.subjects[count] == subject)
      throw new BadUserRequestError(`Error: ${subject} already exists as a subject for ${className}`);
  }
  classExists.subjects.push(subject);
  classExists.save();
  res.status(200).json({ status: "success", message: `${subject} has been added successfully for ${className}`, classExists });
}

const removeClassSubject = async (req, res, next) => {
  const { className, programme } = req.query;
  const { subject } = req.body;
  const classExists = await sClass.findOne({
    $and:
      [
        { className },
        { programme }
      ]
  })
  // console.log(req.body)
  if (!classExists) throw new NotFoundError("Error: the requested class does not exist");
  for (let count = 0; count < classExists.subjects.length; count++) {
    if (classExists.subjects[count] == subject) {
      classExists.subjects.splice(count, 1);
      classExists.save();
      return res.status(200).json({ status: "success", message: `${subject} has been removed successfully for ${className}`, classExists });
    }
  }
  throw new BadUserRequestError(`Error: ${subject} does not exist as a subject for ${className}`);

}

const addClass = async (req, res, next) => {
  const { className, programme } = req.body;
  console.log(req.body)
  const classExists = await sClass.findOne({
    $and:
      [
        { className },
        { programme }
      ]
  })
  if (classExists) throw new BadUserRequestError("Error: this class already exists");
  const classAdded = await sClass.create({ ...req.body })

  res.status(201).json({ status: "success", message: `${className} successfully added for ${programme}`, classAdded });
}

const removeClass = async (req, res, next) => {
  const { className, programme } = req.body;
  console.log(req.body)
  const classExists = await sClass.findOne({
    $and:
      [
        { className },
        { programme }
      ]
  })
  if (!classExists) throw new NotFoundError("Error: no such class found");
  const classRemoved = await sClass.findOneAndDelete({
    $and:
      [
        { className },
        { programme }
      ]
  })

  res.status(201).json({ status: "success", message: `${className} for ${programme} successfully removed`, classRemoved });
}


module.exports = {
  addClass,
  removeClass,
  getClassSubjects,
  addClassSubject,
  removeClassSubject,
  uploadImg,
  uploadPrplSignature,
  uploadPropSignature,
  addDetails,
  addPrincipalSignature,
  addProprietorSignature
}
