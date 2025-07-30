-- Migration: Adicionar coluna emoji para compatibilidade com WhatsApp
-- Todo sticker DEVE ter pelo menos 1 emoji associado (requisito WhatsApp)

-- Adicionar coluna emoji na tabela stickers
ALTER TABLE public.stickers 
ADD COLUMN emoji jsonb DEFAULT '["😊"]'::jsonb;

-- Adicionar comentário explicativo
COMMENT ON COLUMN public.stickers.emoji IS 'Lista de emojis associados ao sticker (obrigatório para WhatsApp). Formato: ["😊", "😄", "😃"]';

-- Criar índice para busca por emojis (opcional, mas recomendado)
-- Nota: Execute este comando separadamente fora da transação
-- CREATE INDEX CONCURRENTLY idx_stickers_emoji ON public.stickers USING gin(emoji);

-- Adicionar constraint para garantir que emoji não seja vazio
ALTER TABLE public.stickers 
ADD CONSTRAINT stickers_emoji_not_empty 
CHECK (jsonb_array_length(emoji) > 0);

-- Atualizar stickers existentes com emojis padrão
UPDATE public.stickers 
SET emoji = '["😊", "🙂", "😄"]'::jsonb 
WHERE emoji IS NULL;

-- Tornar coluna NOT NULL após popular dados existentes
ALTER TABLE public.stickers 
ALTER COLUMN emoji SET NOT NULL;