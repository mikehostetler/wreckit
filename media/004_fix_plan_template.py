"""
Manim animation for Wreckit Issue #004:
Fix plan template to match validator requirements

This animation visualizes the mismatch between the plan template
and the validator expectations, and shows the fix.
"""

from manim import *


class PlanTemplateFix(Scene):
    def construct(self):
        # Title
        title = Text("Issue #004: Plan Template Bug", font_size=42, color=BLUE)
        subtitle = Text("Template vs Validator Mismatch", font_size=28, color=GRAY)

        self.play(Write(title))
        self.play(FadeIn(subtitle.shift(DOWN * 0.8)))
        self.wait(1)
        self.play(FadeOut(title), FadeOut(subtitle))

        # Part 1: The Problem
        problem_title = Text("THE PROBLEM", font_size=36, color=RED)
        self.play(Write(problem_title))
        self.wait(0.5)
        self.play(problem_title.animate.to_edge(UP))

        # Create two columns showing the mismatch
        template_col = self.create_column(
            "Template Has:",
            ["## Current State Analysis", "### Phase 1:", "### Phase 2:"],
            LEFT_COLOR
        )
        validator_col = self.create_column(
            "Validator Expects:",
            ["## Current State", "## Phases", "  ### Phase 1:", "  ### Phase 2:"],
            RIGHT_COLOR
        )

        template_col.shift(LEFT * 3)
        validator_col.shift(RIGHT * 3)

        self.play(FadeIn(template_col), FadeIn(validator_col))
        self.wait(2)

        # Show the error
        error_msg = Text(
            "Validation Error!",
            font_size=28,
            color=RED
        )
        error_msg.next_to(template_col, DOWN, buff=1)
        self.play(Write(error_msg))
        self.wait(2)

        # Clear problem section
        self.play(
            FadeOut(template_col),
            FadeOut(validator_col),
            FadeOut(error_msg),
            FadeOut(problem_title)
        )

        # Part 2: The Fix
        fix_title = Text("THE FIX", font_size=36, color=GREEN)
        self.play(Write(fix_title))
        self.wait(0.5)
        self.play(fix_title.animate.to_edge(UP))

        # Show the changes
        changes = VGroup()

        change1 = Text("1. Rename section:", font_size=28, color=WHITE)
        change2_code = Paragraph(
            "## Current State Analysis",
            "→",
            "## Current State",
            font_size=20,
            line_spacing=0.5
        )
        change2_code[0].set_color(RED)
        change2_code[2].set_color(GREEN)

        change3 = Text("2. Wrap phases:", font_size=28, color=WHITE)
        change4_code = Paragraph(
            "### Phase 1:",
            "→",
            "## Phases",
            "  ### Phase 1:",
            font_size=20,
            line_spacing=0.5
        )
        change4_code[0].set_color(RED)
        change4_code[2].set_color(GREEN)

        changes.add(change1, change2_code, change3, change4_code)
        changes.arrange(DOWN, aligned_edge=LEFT, buff=0.8)
        changes.scale(0.8)

        self.play(FadeIn(changes))
        self.wait(2)

        # Part 3: Success
        self.play(FadeOut(changes), FadeOut(fix_title))

        success_title = Text("SUCCESS", font_size=48, color=GREEN)
        success_msg = Text(
            "Plans now pass validation!",
            font_size=32,
            color=WHITE
        )

        success_group = VGroup(success_title, success_msg)
        success_group.arrange(DOWN, buff=0.5)

        self.play(Write(success_title))
        self.play(FadeIn(success_msg))
        self.wait(2)

        # Final summary
        summary_text = Text(
            "File updated: src/prompts/plan.md",
            font_size=24,
            color=WHITE
        )
        summary_text.next_to(success_group, DOWN, buff=1)

        self.play(FadeIn(summary_text))
        self.wait(3)

        self.play(FadeOut(success_group), FadeOut(summary_text))

    def create_column(self, title, items, color):
        """Create a column with title and items"""
        title_text = Text(title, font_size=28, color=color)
        code_items = VGroup()

        for item in items:
            code = Paragraph(
                item,
                font_size=20,
                font="monospace"
            )
            code_items.add(code)

        code_items.arrange(DOWN, aligned_edge=LEFT, buff=0.3)
        column = VGroup(title_text, code_items)
        column.arrange(DOWN, aligned_edge=LEFT, buff=0.5)

        return column


class ValidationFlowDiagram(Scene):
    """Show the validation flow and where it breaks"""

    def construct(self):
        title = Text("Validation Flow", font_size=42, color=BLUE)
        self.play(Write(title))
        self.play(title.animate.to_edge(UP))
        self.wait(0.5)

        # Flow steps
        steps = [
            "Agent generates plan.md",
            "Template instructions",
            "Validator reads plan.md",
            "Regex matching sections",
            "Pass or Fail"
        ]

        flow = VGroup()
        for i, step in enumerate(steps):
            color = BLUE if i < 3 else (GREEN if i == 4 else YELLOW)
            step_text = Text(step, font_size=24, color=color)
            flow.add(step_text)

        flow.arrange(DOWN, aligned_edge=LEFT, buff=0.5)
        flow.scale(0.8)

        self.play(LaggedStart(*[FadeIn(s) for s in flow], lag_ratio=0.3))
        self.wait(2)

        # Highlight the issue
        issue_box = Rectangle(
            width=6,
            height=2,
            color=RED,
            stroke_width=3
        )
        issue_box.surround(flow[2])

        issue_text = Text(
            "Regex expects exact match!",
            font_size=20,
            color=RED
        )
        issue_text.next_to(issue_box, RIGHT)

        self.play(Create(issue_box), Write(issue_text))
        self.wait(2)

        self.play(FadeOut(flow), FadeOut(issue_box), FadeOut(issue_text), FadeOut(title))


# Scene constants for colors
LEFT_COLOR = BLUE
RIGHT_COLOR = GREEN
