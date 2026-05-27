import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QuestCard } from './QuestCard';
import type { Quest } from '@/lib/types/quest';
import { QuestDifficulty, QuestStatus } from '@/lib/types/quest';

const mockQuest: Quest = {
  id: 'q-1',
  contractQuestId: 'cq-1',
  title: 'Fix Security Bug',
  description: 'Find and fix a critical security vulnerability.',
  category: 'Security',
  difficulty: QuestDifficulty.HARD,
  rewardAsset: 'XLM',
  rewardAmount: 100,
  xpReward: 500,
  verifierAddress: 'GABC123',
  deadline: null,
  status: QuestStatus.ACTIVE,
  totalClaims: 0,
  totalSubmissions: 0,
  approvedSubmissions: 0,
  rejectedSubmissions: 0,
  skills: ['Rust', 'Security'],
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

// Helper: get the card article element (not the quick-apply button)
function getCard() {
  return screen.getByRole('button', {
    name: /Fix Security Bug\. Category:/i,
  });
}

describe('QuestCard keyboard navigation', () => {
  it('is focusable via Tab (tabIndex=0)', () => {
    render(<QuestCard quest={mockQuest} />);
    expect(getCard().getAttribute('tabindex')).toBe('0');
  });

  it('calls onClick when Enter key is pressed', () => {
    const handleClick = vi.fn();
    render(<QuestCard quest={mockQuest} onClick={handleClick} />);
    fireEvent.keyDown(getCard(), { key: 'Enter' });
    expect(handleClick).toHaveBeenCalledOnce();
    expect(handleClick).toHaveBeenCalledWith(mockQuest);
  });

  it('calls onClick when Space key is pressed', () => {
    const handleClick = vi.fn();
    render(<QuestCard quest={mockQuest} onClick={handleClick} />);
    fireEvent.keyDown(getCard(), { key: ' ' });
    expect(handleClick).toHaveBeenCalledOnce();
    expect(handleClick).toHaveBeenCalledWith(mockQuest);
  });

  it('does not call onClick for other keys', () => {
    const handleClick = vi.fn();
    render(<QuestCard quest={mockQuest} onClick={handleClick} />);
    fireEvent.keyDown(getCard(), { key: 'ArrowDown' });
    fireEvent.keyDown(getCard(), { key: 'Tab' });
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('calls onClick when card is clicked', () => {
    const handleClick = vi.fn();
    render(<QuestCard quest={mockQuest} onClick={handleClick} />);
    fireEvent.click(getCard());
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('has an accessible aria-label describing the quest', () => {
    render(<QuestCard quest={mockQuest} />);
    const label = getCard().getAttribute('aria-label') ?? '';
    expect(label).toContain('Fix Security Bug');
    expect(label).toContain('Security');
    expect(label).toContain('advanced');
  });

  it('quick-apply button has tabIndex=-1 (not in tab order)', () => {
    render(<QuestCard quest={mockQuest} onClick={vi.fn()} />);
    const quickApply = screen.getByRole('button', {
      name: /Quick apply for Fix Security Bug/i,
    });
    expect(quickApply.getAttribute('tabindex')).toBe('-1');
  });

  it('quick-apply button click does not bubble to card handler', () => {
    const handleClick = vi.fn();
    render(<QuestCard quest={mockQuest} onClick={handleClick} />);
    const quickApply = screen.getByRole('button', {
      name: /Quick apply for Fix Security Bug/i,
    });
    fireEvent.click(quickApply);
    // onClick is still called (quick apply triggers it), but only once
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('renders progress bar with correct aria attributes when progress is provided', () => {
    const { container } = render(<QuestCard quest={mockQuest} progress={60} />);
    // The progressbar is inside aria-hidden, so query via DOM directly
    const progressBar = container.querySelector('[role="progressbar"]');
    expect(progressBar).not.toBeNull();
    expect(progressBar!.getAttribute('aria-valuenow')).toBe('60');
    expect(progressBar!.getAttribute('aria-valuemin')).toBe('0');
    expect(progressBar!.getAttribute('aria-valuemax')).toBe('100');
  });
});
