from manim import *

class AutonomousMediaLayer(Scene):
    """
    Visualizes the Autonomous Media Layer integration with Manim and Remotion skills.
    Shows the flow from Wreckit agent to media generation tools.
    """
    def construct(self):
        # Title
        title = Text("Autonomous Media Layer", font_size=48, color=BLUE)
        subtitle = Text("Wreckit Integration with Manim & Remotion", font_size=24, color=GRAY)
        subtitle.next_to(title, DOWN)

        self.play(Write(title))
        self.play(FadeIn(subtitle))
        self.wait(1)
        self.play(FadeOut(title), FadeOut(subtitle))

        # Central Wreckit Hub
        wreckit_label = Text("Wreckit", font_size=36, color=WHITE)
        wreckit_circle = Circle(radius=1.5, color=BLUE, fill_opacity=0.3)
        wreckit_group = VGroup(wreckit_circle, wreckit_label)

        self.play(Create(wreckit_group))
        self.wait(0.5)

        # Media Phase Label
        media_label = Text("Media Phase", font_size=28, color=YELLOW)
        media_label.next_to(wreckit_group, UP, buff=1)
        self.play(Write(media_label))
        self.wait(0.5)

        # Skills nodes - Left side (Manim)
        manim_label = Text("Manim", font_size=24, color=GREEN)
        manim_circle = Circle(radius=1, color=GREEN, fill_opacity=0.2)
        manim_group = VGroup(manim_circle, manim_label)
        manim_group.next_to(wreckit_group, LEFT, buff=2.5)

        manim_desc = Text("Mathematical\nAnimations", font_size=14, color=GREEN)
        manim_desc.next_to(manim_group, DOWN, buff=0.5)

        self.play(Create(manim_group))
        self.play(FadeIn(manim_desc))

        # Skills nodes - Right side (Remotion)
        remotion_label = Text("Remotion", font_size=24, color=ORANGE)
        remotion_circle = Circle(radius=1, color=ORANGE, fill_opacity=0.2)
        remotion_group = VGroup(remotion_circle, remotion_label)
        remotion_group.next_to(wreckit_group, RIGHT, buff=2.5)

        remotion_desc = Text("React-Based\nVideos", font_size=14, color=ORANGE)
        remotion_desc.next_to(remotion_group, DOWN, buff=0.5)

        self.play(Create(remotion_group))
        self.play(FadeIn(remotion_desc))

        # Connection arrows
        wreckit_to_manim = Arrow(wreckit_circle.get_left(), manim_circle.get_right(), color=GREEN, buff=0.1)
        wreckit_to_remotion = Arrow(wreckit_circle.get_right(), remotion_circle.get_left(), color=ORANGE, buff=0.1)

        self.play(Create(wreckit_to_manim), Create(wreckit_to_remotion))
        self.wait(1)

        # Tool permissions for Manim
        manim_tools = VGroup(
            Text("Bash", font_size=16, color=GREEN),
            Text("Write", font_size=16, color=GREEN),
            Text("Read", font_size=16, color=GREEN),
            Text("Glob", font_size=16, color=GREEN)
        )
        manim_tools.arrange(DOWN, aligned_edge=LEFT, buff=0.3)
        manim_tools.next_to(manim_group, LEFT, buff=1)

        for tool in manim_tools:
            self.play(FadeIn(tool), run_time=0.3)

        # Tool permissions for Remotion
        remotion_tools = VGroup(
            Text("Bash", font_size=16, color=ORANGE),
            Text("Write", font_size=16, color=ORANGE),
            Text("Read", font_size=16, color=ORANGE),
            Text("Glob", font_size=16, color=ORANGE)
        )
        remotion_tools.arrange(DOWN, aligned_edge=RIGHT, buff=0.3)
        remotion_tools.next_to(remotion_group, RIGHT, buff=1)

        for tool in remotion_tools:
            self.play(FadeIn(tool), run_time=0.3)

        self.wait(1)

        # Output videos
        output_label = Text("Output:", font_size=20, color=WHITE)
        output_label.next_to(wreckit_group, DOWN, buff=1.5)
        self.play(Write(output_label))

        manim_output = Text(".mp4 Animations", font_size=16, color=GREEN)
        manim_output.next_to(output_label, LEFT, buff=1)
        self.play(FadeIn(manim_output))

        remotion_output = Text(".mp4 Videos", font_size=16, color=ORANGE)
        remotion_output.next_to(output_label, RIGHT, buff=1)
        self.play(FadeIn(remotion_output))

        self.wait(2)

        # Highlight the flow with animated particles
        particle_dot = Dot(radius=0.1, color=YELLOW)
        particle_dot.move_to(wreckit_circle.get_center())
        self.play(FadeIn(particle_dot))

        # Animate particle to Manim
        particle_path_manim = Line(wreckit_circle.get_center(), manim_circle.get_center())
        self.play(MoveAlongPath(particle_dot, particle_path_manim), run_time=1)
        self.play(FadeOut(particle_dot))

        # Show Manim processing
        manim_processing = SurroundingRectangle(manim_group, color=YELLOW, buff=0.2)
        self.play(Create(manim_processing))
        self.play(FadeOut(manim_processing))

        # Animate particle back to Wreckit with output
        particle_dot2 = Dot(radius=0.1, color=GREEN)
        particle_dot2.move_to(manim_circle.get_center())
        self.play(FadeIn(particle_dot2))

        return_path_manim = Line(manim_circle.get_center(), wreckit_circle.get_center())
        self.play(MoveAlongPath(particle_dot2, return_path_manim), run_time=1)
        self.play(FadeOut(particle_dot2))

        # Animate particle to Remotion
        particle_dot3 = Dot(radius=0.1, color=YELLOW)
        particle_dot3.move_to(wreckit_circle.get_center())
        self.play(FadeIn(particle_dot3))

        particle_path_remotion = Line(wreckit_circle.get_center(), remotion_circle.get_center())
        self.play(MoveAlongPath(particle_dot3, particle_path_remotion), run_time=1)
        self.play(FadeOut(particle_dot3))

        # Show Remotion processing
        remotion_processing = SurroundingRectangle(remotion_group, color=YELLOW, buff=0.2)
        self.play(Create(remotion_processing))
        self.play(FadeOut(remotion_processing))

        # Animate particle back to Wreckit with output
        particle_dot4 = Dot(radius=0.1, color=ORANGE)
        particle_dot4.move_to(remotion_circle.get_center())
        self.play(FadeIn(particle_dot4))

        return_path_remotion = Line(remotion_circle.get_center(), wreckit_circle.get_center())
        self.play(MoveAlongPath(particle_dot4, return_path_remotion), run_time=1)
        self.play(FadeOut(particle_dot4))

        self.wait(1)

        # Final summary
        everything = VGroup(
            wreckit_group, media_label,
            manim_group, manim_desc, manim_tools, manim_output,
            remotion_group, remotion_desc, remotion_tools, remotion_output,
            wreckit_to_manim, wreckit_to_remotion, output_label
        )

        summary_text = Text("Autonomous Media Generation Complete!", font_size=32, color=BLUE)
        summary_text.to_edge(UP)
        self.play(FadeIn(summary_text))
        self.wait(1)

        # Fade out everything
        self.play(FadeOut(everything), FadeOut(summary_text))

        # End with final message
        final_text = Text("Wreckit Media Layer", font_size=48, color=BLUE)
        final_subtext = Text("Empowering Autonomous Video Generation", font_size=24, color=GRAY)
        final_subtext.next_to(final_text, DOWN)

        self.play(Write(final_text))
        self.play(FadeIn(final_subtext))
        self.wait(2)
        self.play(FadeOut(final_text), FadeOut(final_subtext))
