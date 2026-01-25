"""
Manim animation demonstrating the improved ID resolution system for Wreckit.

This visualization shows:
1. Current state: Numeric-only resolution
2. New system: Three-tier matching (exact → numeric → slug)
3. Ambiguity detection with error examples
"""

from manim import *


class CurrentStateScene(Scene):
    """Scene showing the current limited ID resolution system"""
    def construct(self):
        # Title
        title = Text("Current ID Resolution", font_size=48, color=WHITE)
        self.play(Write(title))
        self.wait(0.5)
        self.play(title.animate.to_edge(UP))

        # Show current limitation
        limitation = Text(
            "Only numeric shorthand (1, 2, 3...)",
            font_size=32,
            color=RED
        )
        self.play(FadeIn(limitation))
        self.wait(1)

        # Example items
        items_group = VGroup()
        item_texts = [
            "001-add-dark-mode",
            "002-fix-auth-bug",
            "003-add-dark-mode-preview"
        ]

        for i, item_text in enumerate(item_texts):
            item = Text(f"{i+1}. {item_text}", font_size=24, color=BLUE)
            item.shift(DOWN * 0.5 + UP * (i * 0.8))
            items_group.add(item)

        items_group.next_to(limitation, DOWN, buff=1)
        self.play(FadeIn(items_group))
        self.wait(1)

        # Show problem
        problem_text = Text(
            "Problem: Can't use full IDs or slugs!",
            font_size=28,
            color=YELLOW
        )
        problem_text.next_to(items_group, DOWN, buff=1)
        self.play(FadeIn(problem_text))
        self.wait(2)

        # Fade out
        self.play(FadeOut(VGroup(limitation, items_group, problem_text, title)))


class NewSystemScene(Scene):
    """Scene showing the new three-tier resolution system"""
    def construct(self):
        # Title
        title = Text("New ID Resolution System", font_size=48, color=WHITE)
        self.play(Write(title))
        self.wait(0.5)
        self.play(title.animate.to_edge(UP))

        # Three-tier matching visualization
        tier_labels = VGroup()
        tiers = [
            ("1. Exact Match", GREEN, "001-add-dark-mode"),
            ("2. Numeric Prefix", BLUE, "1 → 001-add-dark-mode"),
            ("3. Slug Suffix", PURPLE, "dark-mode → *-dark-mode")
        ]

        for i, (label_text, color, example) in enumerate(tiers):
            tier = VGroup()
            label = Text(label_text, font_size=28, color=color)
            example_text = Text(example, font_size=20, color=WHITE)

            tier.add(label, example_text)
            tier.arrange(DOWN, aligned_edge=LEFT)
            tier.shift(UP * 1.5 + DOWN * (i * 1.5))

            tier_labels.add(tier)
            self.play(FadeIn(tier), run_time=0.5)
            self.wait(0.5)

        self.wait(2)
        self.play(FadeOut(VGroup(tier_labels, title)))


class AmbiguityDetectionScene(Scene):
    """Scene showing ambiguity detection feature"""
    def construct(self):
        # Title
        title = Text("Ambiguity Detection", font_size=48, color=WHITE)
        self.play(Write(title))
        self.wait(0.5)
        self.play(title.animate.to_edge(UP))

        # Example items with ambiguous slug
        items_group = VGroup()
        item_texts = [
            "001-add-dark-mode",
            "002-fix-auth-bug",
            "003-add-dark-mode-preview"
        ]

        for i, item_text in enumerate(item_texts):
            item = Text(f"• {item_text}", font_size=24, color=BLUE)
            item.shift(UP * 0.5 + DOWN * (i * 0.7))
            items_group.add(item)

        items_group.shift(LEFT * 2)
        self.play(FadeIn(items_group))
        self.wait(1)

        # Show ambiguous input
        input_text = Text(
            'Input: "dark-mode"',
            font_size=28,
            color=YELLOW
        )
        input_text.next_to(items_group, RIGHT, buff=2)
        self.play(FadeIn(input_text))
        self.wait(1)

        # Show arrow
        arrow = Arrow(
            start=input_text.get_right() + RIGHT * 0.5,
            end=input_text.get_right() + RIGHT * 2,
            color=RED,
            buff=0
        )
        self.play(Create(arrow))
        self.wait(0.5)

        # Show error
        error_box = Rectangle(
            width=5,
            height=3,
            color=RED,
            stroke_width=3
        )
        error_box.next_to(arrow, RIGHT, buff=0.5)

        error_text = Text(
            "AMBIGUOUS!",
            font_size=24,
            color=RED
        )
        error_text.move_to(error_box.get_center() + UP * 0.5)

        matches_text = Text(
            "Matches:",
            font_size=16,
            color=WHITE
        )
        matches_text.next_to(error_text, DOWN, buff=0.3)

        match1 = Text("• 001-add-dark-mode", font_size=14, color=WHITE)
        match1.next_to(matches_text, DOWN, buff=0.1)

        match2 = Text("• 003-add-dark-mode-preview", font_size=14, color=WHITE)
        match2.next_to(match1, DOWN, buff=0.1)

        error_group = VGroup(error_box, error_text, matches_text, match1, match2)
        self.play(FadeIn(error_group))
        self.wait(3)

        # Fade out
        self.play(FadeOut(VGroup(items_group, input_text, arrow, error_group, title)))


class SuccessCaseScene(Scene):
    """Scene showing successful resolution examples"""
    def construct(self):
        # Title
        title = Text("Successful Resolution Examples", font_size=48, color=WHITE)
        self.play(Write(title))
        self.wait(0.5)
        self.play(title.animate.to_edge(UP))

        # Example items
        items = VGroup()
        item_texts = [
            "001-add-dark-mode",
            "002-fix-auth-bug",
            "003-improve-performance"
        ]

        for i, item_text in enumerate(item_texts):
            item = Text(f"• {item_text}", font_size=20, color=BLUE)
            item.shift(UP * 2 + DOWN * (i * 0.6))
            items.add(item)

        items.to_edge(LEFT)
        self.play(FadeIn(items))
        self.wait(1)

        # Success examples
        examples = VGroup()
        success_cases = [
            ("'001'", "→", "001-add-dark-mode", GREEN),
            ("'add-dark-mode'", "→", "001-add-dark-mode", GREEN),
            ("'fix-auth'", "→", "002-fix-auth-bug", GREEN),
        ]

        for i, (input_str, arrow_text, output, color) in enumerate(success_cases):
            example = VGroup()
            inp = Text(input_str, font_size=24, color=YELLOW)
            arr = Text(arrow_text, font_size=24, color=WHITE)
            out = Text(output, font_size=24, color=color)

            example.add(inp, arr, out)
            example.arrange(RIGHT, buff=0.3)
            example.shift(DOWN * 0.5 + DOWN * (i * 0.8))

            examples.add(example)
            self.play(FadeIn(example), run_time=0.5)
            self.wait(0.5)

        self.wait(2)
        self.play(FadeOut(VGroup(items, examples, title)))


class IDResolutionOverview(Scene):
    """Complete overview of the ID resolution improvement"""
    def construct(self):
        # Main title
        title = Text("ID Resolution Improvement", font_size=56, color=WHITE)
        subtitle = Text("Spec 009 - Gap 3", font_size=32, color=GRAY)

        title_group = VGroup(title, subtitle)
        title_group.arrange(DOWN)
        self.play(Write(title_group))
        self.wait(1)
        self.play(title_group.animate.to_edge(UP))

        # Problem statement
        problem = Text(
            "Problem: Limited ID support, no ambiguity detection",
            font_size=28,
            color=RED
        )
        problem.next_to(title_group, DOWN, buff=1)
        self.play(FadeIn(problem))
        self.wait(1)
        self.play(FadeOut(problem))

        # Solution - three pillars
        solution_title = Text(
            "Solution: Three-Tier Matching + Ambiguity Detection",
            font_size=32,
            color=GREEN
        )
        solution_title.next_to(title_group, DOWN, buff=1)
        self.play(FadeIn(solution_title))
        self.wait(0.5)

        # Three-tier box
        tiers_box = Rectangle(
            width=10,
            height=4,
            color=BLUE,
            stroke_width=2
        )
        tiers_box.next_to(solution_title, DOWN, buff=1)

        tier1 = Text("1. Exact Match", font_size=24, color=GREEN)
        tier2 = Text("2. Numeric Prefix", font_size=24, color=BLUE)
        tier3 = Text("3. Slug Suffix", font_size=24, color=PURPLE)

        tiers = VGroup(tier1, tier2, tier3)
        tiers.arrange(DOWN, aligned_edge=LEFT, buff=0.5)
        tiers.move_to(tiers_box.get_center())

        self.play(Create(tiers_box), FadeIn(tiers))
        self.wait(2)

        # Ambiguity detection
        ambiguity_text = Text(
            "+ Ambiguity Detection = Clear Errors",
            font_size=28,
            color=YELLOW
        )
        ambiguity_text.next_to(tiers_box, DOWN, buff=1)
        self.play(FadeIn(ambiguity_text))
        self.wait(2)

        # Benefits
        benefits = VGroup()
        benefit_texts = [
            "✓ Full ID support",
            "✓ Numeric shorthand",
            "✓ Slug-based matching",
            "✓ Clear error messages",
            "✓ Prevents accidental wrong-item operations"
        ]

        for i, benefit in enumerate(benefit_texts):
            b_text = Text(benefit, font_size=20, color=WHITE)
            b_text.shift(DOWN * (i * 0.5))
            benefits.add(b_text)

        benefits.next_to(ambiguity_text, DOWN, buff=1)
        self.play(FadeIn(benefits))
        self.wait(3)

        # Final fade out
        self.play(FadeOut(VGroup(title_group, solution_title, tiers_box, tiers,
                                  ambiguity_text, benefits)))
