from manim import *

class ExampleScene(Scene):
    def construct(self):
        # Create a title
        title = Text("Wreckit Media Layer", font_size=48)
        self.play(Write(title))
        self.wait(1)

        # Create a circle
        circle = Circle(radius=2, color=BLUE)
        self.play(Create(circle))
        self.wait(1)

        # Transform the circle
        square = Square(side_length=4, color=RED)
        self.play(Transform(circle, square))
        self.wait(1)

        # Fade out
        self.play(FadeOut(circle), FadeOut(title))
