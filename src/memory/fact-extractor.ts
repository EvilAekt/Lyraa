/**
 * Fact Extractor for Long-term Memory
 * Implements PRD §9, FR-P3, and SEC-10:
 * - Extracts salient, non-sensitive user facts from conversations
 * - Supports pattern-based preference extraction and structured candidate validation
 * - Enforces zero sensitive fact retention (TC-15)
 */

import { MemoryStore, AddMemoryResult } from './memory-store.js';

export interface ExtractedFactCandidate {
  fact: string;
  category: 'gaming' | 'preference' | 'hobby' | 'general' | 'identity';
  confidence: number;
}

export class FactExtractor {
  private memoryStore: MemoryStore;

  constructor(memoryStore: MemoryStore) {
    this.memoryStore = memoryStore;
  }

  /**
   * Rule-based extraction patterns for conversational preferences.
   * Extracts user personal tastes (favorite games, foods, agents, hobbies) without latency overhead.
   */
  public extractFromText(text: string): ExtractedFactCandidate[] {
    if (!text || text.trim().length === 0) return [];

    const candidates: ExtractedFactCandidate[] = [];
    const trimmed = text.trim();

    // Pattern 1: Favorite game / main game
    // Contoh: "aku suka main game apex legends bareng temen", "aku suka main valorant", "gue sering main dota"
    const gameMatch = trimmed.match(
      /(?:suka\s+main\s+game|suka\s+main|sering\s+main|biasa\s+main|game\s+favoritku|demen\s+main)\s+([^.,!?\n]+?)(?:\s+(?:bareng|sama|di|pas|kalo|kalau|aja|terus|nih|ya|dong)\b|[.,!?\n]|$)/i
    );
    if (gameMatch) {
      const game = gameMatch[1].trim();
      if (!this.memoryStore.isSensitiveFact(game) && game.length >= 2 && game.length <= 40) {
        candidates.push({
          fact: `Suka bermain game ${game}`,
          category: 'gaming',
          confidence: 0.9,
        });
      }
    }

    // Pattern 2: Explicit favorite (game, makanan, minuman, musik, anime)
    // Contoh: "makanan favoritku nasi goreng pedas", "anime kesukaanku frieren"
    const favMatch = trimmed.match(
      /(?:([a-zA-Z]+)\s+)?(?:favoritku|kesukaanku)\s+(?:adalah\s+)?([^.,!?\n]+?)(?:\s+(?:banget|sih|nih|ya)\b|[.,!?\n]|$)/i
    );
    if (favMatch) {
      const type = favMatch[1] ? favMatch[1].trim() : 'Hal';
      const item = favMatch[2].trim();
      if (!this.memoryStore.isSensitiveFact(item) && item.length >= 2 && item.length <= 40) {
        candidates.push({
          fact: `${type} favorit: ${item}`,
          category: 'preference',
          confidence: 0.85,
        });
      }
    }

    // Pattern 3: General likes & preferences
    // Contoh: "aku suka kopi susu", "gue demen mie ayam", "aku suka kucing"
    const generalLikeMatch = trimmed.match(
      /\b(?:aku|gue|gw|saya)\s+(?:paling\s+)?(?:suka|demen|gemar)\s+([^.,!?\n]+?)(?:\s+(?:banget|sih|nih|ya)\b|[.,!?\n]|$)/i
    );
    if (generalLikeMatch) {
      const likedThing = generalLikeMatch[1].trim();
      // Pastikan bukan main game yang sudah tertangkap di pattern 1
      if (!likedThing.startsWith('main') && !this.memoryStore.isSensitiveFact(likedThing) && likedThing.length >= 2 && likedThing.length <= 40) {
        candidates.push({
          fact: `Menyukai ${likedThing}`,
          category: 'preference',
          confidence: 0.85,
        });
      }
    }

    // Pattern 4: Dislikes & Allergies
    // Contoh: "aku gak suka pedas", "aku alergi udang", "gue benci durian"
    const dislikeMatch = trimmed.match(
      /\b(?:aku|gue|gw|saya)\s+(?:gak\s+suka|tidak\s+suka|benci|alergi(?:\s+sama)?)\s+([^.,!?\n]+?)(?:\s+(?:banget|sih|nih|ya)\b|[.,!?\n]|$)/i
    );
    if (dislikeMatch) {
      const dislikedItem = dislikeMatch[1].trim();
      if (!this.memoryStore.isSensitiveFact(dislikedItem) && dislikedItem.length >= 2 && dislikedItem.length <= 40) {
        candidates.push({
          fact: `Tidak menyukai / alergi terhadap ${dislikedItem}`,
          category: 'preference',
          confidence: 0.9,
        });
      }
    }

    // Pattern 5: Hobbies
    // Contoh: "hobiku fotografi", "aku hobi dengerin musik"
    const hobbyMatch = trimmed.match(
      /\b(?:hobi(?:ku)?|hobiku\s+adalah)\s+([^.,!?\n]+?)(?:\s+(?:banget|sih|nih|ya)\b|[.,!?\n]|$)/i
    );
    if (hobbyMatch) {
      const hobby = hobbyMatch[1].trim();
      if (!this.memoryStore.isSensitiveFact(hobby) && hobby.length >= 2 && hobby.length <= 40) {
        candidates.push({
          fact: `Hobi: ${hobby}`,
          category: 'hobby',
          confidence: 0.85,
        });
      }
    }

    // Pattern 6: Calling name / nickname
    // Contoh: "panggil aku dimas ya", "namaku ryan", "nama gue aekt", "panggil gue aekt"
    const nameMatch = trimmed.match(
      /\b(?:panggil\s+(?:aku|gue|gw|saya)|nama\s+(?:ku|gue|gw|saya))\s+(?:adalah\s+)?([a-zA-Z0-9_ -]{2,20})(?:\s+(?:aja|ya|dong)\b|[.,!?\n]|$)/i
    );
    if (nameMatch) {
      const name = nameMatch[1].trim();
      if (!this.memoryStore.isSensitiveFact(name) && name.length >= 2) {
        candidates.push({
          fact: `Nama panggilan: ${name}`,
          category: 'identity' as any,
          confidence: 0.95,
        });
      }
    }

    return candidates;
  }

  /**
   * Process a turn, extract facts, filter out sensitive content, and save to SQLite.
   */
  public processTurnAndSave(userId: string, userInput: string, source = 'chat'): AddMemoryResult[] {
    const candidates = this.extractFromText(userInput);
    const results: AddMemoryResult[] = [];

    for (const candidate of candidates) {
      const saveResult = this.memoryStore.addUserMemory({
        userId,
        fact: candidate.fact,
        category: candidate.category,
        source,
        confidence: candidate.confidence,
      });
      results.push(saveResult);
    }

    return results;
  }
}
