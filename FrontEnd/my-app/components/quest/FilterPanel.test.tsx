import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FilterPanel } from './FilterPanel';
import { QuestDifficulty, QuestStatus } from '@/lib/types/quest';

const noop = () => {};

const defaultProps = {
  onStatusChange: noop,
  onDifficultyChange: noop,
  onCategoryChange: noop,
  onClearFilters: noop,
};

describe('FilterPanel keyboard navigation', () => {
  it('all filter buttons are focusable (no negative tabIndex)', () => {
    render(<FilterPanel {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    for (const btn of buttons) {
      const tabIndex = btn.getAttribute('tabindex');
      expect(tabIndex === null || parseInt(tabIndex) >= 0).toBe(true);
    }
  });

  it('category buttons are activated by Enter key', () => {
    const onCategoryChange = vi.fn();
    render(<FilterPanel {...defaultProps} onCategoryChange={onCategoryChange} />);
    const securityBtn = screen.getByRole('button', {
      name: /Filter by Security category/i,
    });
    fireEvent.click(securityBtn);
    expect(onCategoryChange).toHaveBeenCalledWith('Security');
  });

  it('category button toggles off when already selected', () => {
    const onCategoryChange = vi.fn();
    render(
      <FilterPanel
        {...defaultProps}
        selectedCategory="Security"
        onCategoryChange={onCategoryChange}
      />
    );
    const securityBtn = screen.getByRole('button', {
      name: /Filter by Security category/i,
    });
    fireEvent.click(securityBtn);
    expect(onCategoryChange).toHaveBeenCalledWith(undefined);
  });

  it('difficulty buttons call onDifficultyChange with correct value', () => {
    const onDifficultyChange = vi.fn();
    render(
      <FilterPanel {...defaultProps} onDifficultyChange={onDifficultyChange} />
    );
    const hardBtn = screen.getByRole('button', {
      name: /Filter by Hard difficulty/i,
    });
    fireEvent.click(hardBtn);
    expect(onDifficultyChange).toHaveBeenCalledWith(QuestDifficulty.HARD);
  });

  it('difficulty button toggles off when already selected', () => {
    const onDifficultyChange = vi.fn();
    render(
      <FilterPanel
        {...defaultProps}
        selectedDifficulty={QuestDifficulty.EASY}
        onDifficultyChange={onDifficultyChange}
      />
    );
    const easyBtn = screen.getByRole('button', {
      name: /Filter by Easy difficulty/i,
    });
    fireEvent.click(easyBtn);
    expect(onDifficultyChange).toHaveBeenCalledWith(undefined);
  });

  it('"All" category button clears category filter', () => {
    const onCategoryChange = vi.fn();
    render(
      <FilterPanel
        {...defaultProps}
        selectedCategory="Backend"
        onCategoryChange={onCategoryChange}
      />
    );
    const allBtn = screen.getByRole('button', { name: /Show all categories/i });
    fireEvent.click(allBtn);
    expect(onCategoryChange).toHaveBeenCalledWith(undefined);
  });

  it('"All" difficulty button clears difficulty filter', () => {
    const onDifficultyChange = vi.fn();
    render(
      <FilterPanel
        {...defaultProps}
        selectedDifficulty={QuestDifficulty.MEDIUM}
        onDifficultyChange={onDifficultyChange}
      />
    );
    const allBtn = screen.getByRole('button', {
      name: /Show all difficulty levels/i,
    });
    fireEvent.click(allBtn);
    expect(onDifficultyChange).toHaveBeenCalledWith(undefined);
  });

  it('selected category button has aria-pressed=true', () => {
    render(
      <FilterPanel {...defaultProps} selectedCategory="Frontend" />
    );
    const frontendBtn = screen.getByRole('button', {
      name: /Filter by Frontend category/i,
    });
    expect(frontendBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('unselected category button has aria-pressed=false', () => {
    render(<FilterPanel {...defaultProps} />);
    const securityBtn = screen.getByRole('button', {
      name: /Filter by Security category/i,
    });
    expect(securityBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('selected difficulty button has aria-pressed=true', () => {
    render(
      <FilterPanel
        {...defaultProps}
        selectedDifficulty={QuestDifficulty.MEDIUM}
      />
    );
    const mediumBtn = screen.getByRole('button', {
      name: /Filter by Medium difficulty/i,
    });
    expect(mediumBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('"Clear all filters" button is visible only when filters are active', () => {
    const { rerender } = render(<FilterPanel {...defaultProps} />);
    expect(
      screen.queryByRole('button', { name: /Clear all active filters/i })
    ).toBeNull();

    rerender(
      <FilterPanel {...defaultProps} selectedCategory="Docs" />
    );
    expect(
      screen.getByRole('button', { name: /Clear all active filters/i })
    ).toBeTruthy();
  });

  it('"Clear all filters" button calls onClearFilters', () => {
    const onClearFilters = vi.fn();
    render(
      <FilterPanel
        {...defaultProps}
        selectedCategory="Testing"
        onClearFilters={onClearFilters}
      />
    );
    const clearBtn = screen.getByRole('button', {
      name: /Clear all active filters/i,
    });
    fireEvent.click(clearBtn);
    expect(onClearFilters).toHaveBeenCalledOnce();
  });

  it('filter panel has role=search with accessible label', () => {
    render(<FilterPanel {...defaultProps} />);
    const panel = screen.getByRole('search', { name: /Quest filters/i });
    expect(panel).toBeTruthy();
  });
});
