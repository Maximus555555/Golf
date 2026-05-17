export const COACHING_RESPONSES = {
  excessive_head_movement: {
    issueId: 'excessive_head_movement',
    title: 'Keep your head more centered',
    severity: {
      low: {
        whatHappened: 'Your head moved slightly during the swing.',
        whyItMatters: 'A little movement is normal, but too much can make contact less consistent.',
        howToFix: 'Focus on turning your shoulders while keeping your head relatively centered.',
        drill: 'Make slow half-swings while keeping your eyes fixed on the ball area.',
        recordingTip: 'Make sure your full head and feet are visible in the video.',
      },
      medium: {
        whatHappened: 'Your head moved noticeably during the swing.',
        whyItMatters: 'Large head movement can make it harder to return the club consistently to the ball.',
        howToFix: 'Feel like your chest and shoulders rotate around a stable center.',
        drill: 'Take five slow swings where your goal is to keep your head within a small imaginary box.',
        recordingTip: 'Record from face-on for the best head-movement reading.',
      },
      high: {
        whatHappened: 'Your head moved a lot during the swing.',
        whyItMatters: 'Excessive head movement can make timing, balance, and contact much harder to repeat.',
        howToFix: 'Shorten your backswing and swing at about 70% speed until your head stays steadier.',
        drill: 'Place a visual marker behind the ball and make slow swings while keeping your head centered over that marker.',
        recordingTip: 'Use a stable phone position; handheld video can make head movement harder to measure.',
      },
    },
  },
  posture_loss: {
    issueId: 'posture_loss',
    title: 'Maintain your posture longer',
    severity: {
      low: {
        whatHappened: 'Your posture changed slightly during the swing.',
        whyItMatters: 'Small posture changes are normal, but rising too early can make contact inconsistent.',
        howToFix: 'Keep your knees flexed and maintain your chest angle longer.',
        drill: 'Make slow practice swings while feeling your chest stay pointed toward the ball area.',
        recordingTip: 'Record from down-the-line or side view if possible.',
      },
      medium: {
        whatHappened: 'Your upper body appeared to rise during the swing.',
        whyItMatters: 'Standing up can change your swing path and cause thin shots, topped shots, or inconsistent contact.',
        howToFix: 'Stay in your athletic posture longer and avoid lifting your chest early.',
        drill: 'Make three-quarter swings and hold your finish, checking that you did not pop upward too soon.',
        recordingTip: 'Keep your full body in frame so shoulder and hip height can be tracked.',
      },
      high: {
        whatHappened: 'You appeared to stand up significantly during the swing.',
        whyItMatters: 'Major posture loss makes it difficult to return the club to the same impact position.',
        howToFix: 'Slow the swing down and focus on keeping your hips back and chest angle steady through impact.',
        drill: 'Practice slow-motion swings with your backside lightly touching a chair or wall to feel your posture stay back.',
        recordingTip: 'Side-view video works best for detecting posture loss.',
      },
    },
  },
  lead_arm_collapse: {
    issueId: 'lead_arm_collapse',
    title: 'Keep width in your lead arm',
    severity: {
      low: {
        whatHappened: 'Your lead arm bent slightly near the top of the backswing.',
        whyItMatters: 'Some bend can be acceptable, but too much can make the swing harder to control.',
        howToFix: 'Keep width in your backswing without locking your arm stiffly.',
        drill: 'Make half-swings focusing on a wide takeaway.',
        recordingTip: 'Record from face-on so the app can see the lead arm clearly.',
      },
      medium: {
        whatHappened: 'Your lead arm appeared to bend noticeably near the top of the backswing.',
        whyItMatters: 'A collapsing lead arm can make the backswing too long and reduce consistency.',
        howToFix: 'Shorten your backswing and keep the lead arm comfortably extended.',
        drill: 'Practice three-quarter swings where the lead arm stays wide and relaxed.',
        recordingTip: 'Avoid loose sleeves that hide elbow position.',
      },
      high: {
        whatHappened: 'Your lead arm collapsed significantly at the top of the backswing.',
        whyItMatters: 'A major arm collapse can make the club travel too far and force rushed timing on the downswing.',
        howToFix: 'Make a shorter, more controlled backswing and focus on width rather than power.',
        drill: 'Pause at the top of a three-quarter backswing and check that your lead arm still has structure.',
        recordingTip: 'Make sure the camera can see both shoulder and wrist clearly.',
      },
    },
  },
  hip_sway: {
    issueId: 'hip_sway',
    title: 'Turn instead of swaying',
    severity: {
      low: {
        whatHappened: 'Your hips shifted slightly sideways during the swing.',
        whyItMatters: 'A small shift is normal, but too much sway can make timing harder.',
        howToFix: 'Feel like you are rotating around your center instead of sliding away from the ball.',
        drill: 'Make slow swings with your feet closer together.',
        recordingTip: 'Record from face-on for the best hip-sway reading.',
      },
      medium: {
        whatHappened: 'Your hips appeared to slide sideways during the swing.',
        whyItMatters: 'Too much sway can make it difficult to rotate back through the ball consistently.',
        howToFix: 'Keep pressure more centered and turn your trail hip back instead of sliding.',
        drill: 'Practice backswings while keeping the inside of your trail foot grounded.',
        recordingTip: 'Make sure your feet and hips are both visible.',
      },
      high: {
        whatHappened: 'Your hips moved far sideways instead of staying centered.',
        whyItMatters: 'Excessive sway can cause inconsistent contact and make the downswing harder to time.',
        howToFix: 'Reduce backswing length and focus on turning, not drifting.',
        drill: 'Place an object just outside your trail hip during practice swings and avoid bumping into it.',
        recordingTip: 'Use a stable face-on camera angle.',
      },
    },
  },
  poor_finish_balance: {
    issueId: 'poor_finish_balance',
    title: 'Hold a balanced finish',
    severity: {
      low: {
        whatHappened: 'Your finish looked slightly unstable.',
        whyItMatters: 'Finish balance can reveal whether the swing was controlled.',
        howToFix: 'Swing slightly slower and hold your finish.',
        drill: 'Hold every finish for three seconds.',
        recordingTip: 'Keep the camera recording until the full finish is complete.',
      },
      medium: {
        whatHappened: 'Your finish position looked unstable.',
        whyItMatters: 'Poor balance often means the swing was rushed or your weight moved inefficiently.',
        howToFix: 'Swing at about 70% speed and focus on finishing tall and balanced.',
        drill: 'Hit or rehearse swings where the goal is to pose at the finish without stepping.',
        recordingTip: 'Make sure your feet remain visible through the finish.',
      },
      high: {
        whatHappened: 'You lost clear balance at the end of the swing.',
        whyItMatters: 'Losing balance can indicate over-swinging, poor weight transfer, or unstable posture.',
        howToFix: 'Shorten the swing and make a smoother tempo the priority before adding power.',
        drill: 'Make slow swings and hold the finish until the ball would have landed.',
        recordingTip: 'Record the entire swing and follow-through, not just impact.',
      },
    },
  },
  weak_shoulder_turn: {
    issueId: 'weak_shoulder_turn',
    title: 'Turn your shoulders more fully',
    severity: {
      low: {
        whatHappened: 'Your shoulder turn looked slightly limited.',
        whyItMatters: 'Limited rotation can reduce power and make the swing more arm-dominant.',
        howToFix: 'Let your lead shoulder turn under your chin while staying balanced.',
        drill: 'Make slow turns without a club, feeling your shoulders rotate around your spine.',
        recordingTip: 'Face-on video works best for shoulder-turn feedback.',
      },
      medium: {
        whatHappened: 'Your shoulders did not appear to rotate enough in the backswing.',
        whyItMatters: 'A limited shoulder turn can force you to use mostly arms, which reduces consistency and power.',
        howToFix: 'Turn your chest away from the target while keeping your lower body stable.',
        drill: 'Cross your arms over your chest and rehearse shoulder turns before swinging.',
        recordingTip: 'Make sure both shoulders are visible.',
      },
      high: {
        whatHappened: 'Your backswing had very limited shoulder rotation.',
        whyItMatters: 'Without enough shoulder turn, the swing may become short, weak, or overly hand-driven.',
        howToFix: 'Slow down the takeaway and focus on turning your chest, not just lifting your arms.',
        drill: 'Practice the “lead shoulder under chin” feeling in front of a mirror or camera.',
        recordingTip: 'Record from face-on with the phone far enough back to see your torso.',
      },
    },
  },
};

export const SEVERITY_SCORE = {
  low: 1,
  medium: 2,
  high: 3,
};

export function getCoachingResponse(issueId, severity) {
  const response = COACHING_RESPONSES[issueId];
  if (!response) return null;

  const severityKey = response.severity[severity] ? severity : 'low';

  return {
    issueId: response.issueId,
    title: response.title,
    severity: severityKey,
    ...response.severity[severityKey],
  };
}
