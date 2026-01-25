from manim import *

class SimpleMediaLayer(Scene):
    """
    Simple visualization of the Autonomous Media Layer
    """
    def construct(self):
        # Title
        title = Text("Wreckit Media Layer", font_size=48, color=BLUE)
        self.play(Write(title))
        self.wait(1)

        # Central hub
        circle = Circle(radius=2, color=BLUE, fill_opacity=0.3)
        self.play(Create(circle))
        self.wait(0.5)

        # Left node (Manim)
        left_circle = Circle(radius=1, color=GREEN, fill_opacity=0.3)
        left_circle.shift(LEFT * 4)
        left_text = Text("Manim", font_size=24).move_to(left_circle.get_center())
        self.play(Create(left_circle), Write(left_text))
        self.wait(0.5)

        # Right node (Remotion)
        right_circle = Circle(radius=1, color=ORANGE, fill_opacity=0.3)
        right_circle.shift(RIGHT * 4)
        right_text = Text("Remotion", font_size=24).move_to(right_circle.get_center())
        self.play(Create(right_circle), Write(right_text))
        self.wait(0.5)

        # Arrows
        arrow_left = Arrow(circle.get_left(), left_circle.get_right(), color=GREEN)
        arrow_right = Arrow(circle.get_right(), right_circle.get_left(), color=ORANGE)
        self.play(Create(arrow_left), Create(arrow_right))
        self.wait(1)

        # Transform to show integration
        self.play(Transform(circle, Circle(radius=2.5, color=YELLOW, fill_opacity=0.5)))
        self.wait(1)

        # Fade out
        self.play(FadeOut(circle), FadeOut(left_circle), FadeOut(right_circle),
                  FadeOut(left_text), FadeOut(right_text),
                  FadeOut(arrow_left), FadeOut(arrow_right),
                  FadeOut(title))
