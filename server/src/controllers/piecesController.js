'use strict';

const svc = require('../services/piecesService');

async function list(req, res, next) {
  try {
    const pieces = await svc.listPieces(req.user.id);
    res.json({ pieces });
  } catch (err) { next(err); }
}

async function save(req, res, next) {
  try {
    const piece = await svc.savePiece(req.user.id, req.body);
    res.status(201).json({ piece });
  } catch (err) { next(err); }
}

async function getContent(req, res, next) {
  try {
    const piece = await svc.getPieceContent(req.user.id, req.params.id);
    res.json({ piece });
  } catch (err) { next(err); }
}

async function favorite(req, res, next) {
  try {
    const result = await svc.toggleFavorite(req.user.id, req.params.id);
    res.json(result);
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await svc.deletePiece(req.user.id, req.params.id);
    res.json({ message: 'Piece deleted' });
  } catch (err) { next(err); }
}

async function played(req, res, next) {
  try {
    const result = await svc.markPlayed(req.user.id, req.params.id);
    res.json(result);
  } catch (err) { next(err); }
}

async function rename(req, res, next) {
  try {
    const result = await svc.renamePiece(req.user.id, req.params.id, req.body.title);
    res.json(result);
  } catch (err) { next(err); }
}

module.exports = { list, save, getContent, favorite, rename, remove, played };
